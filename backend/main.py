import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from backend.data_service import (
    get_account_hostname_coverage,
    get_account_hostname_cname_coverage,
    get_account_hostname_cname_matrix,
    get_account_hostname_cname_matrix_summary,
    get_account_feature_matrix,
    get_account_feature_matrix_summary,
    get_account_feature_matrix_scorecard,
    get_account_sec_host_coverage_matrix,
    get_account_sec_host_coverage_matrix_summary,
    get_account_sec_host_coverage_matrix_scorecard,
    get_account_traffic_matrix,
    get_account_traffic_matrix_summary,
    get_account_traffic_matrix_scorecard,
    get_account_perf_matrix,
    get_account_perf_matrix_summary,
    get_account_perf_matrix_scorecard,
    get_account_perf_matrix_topn,
    get_account_perf_matrix_topn_summary,
    get_account_perf_matrix_topn_scorecard,
    get_account_dashboard_data,
    get_summary_dashboard_data,
    get_summary_dashboard_debug,
)
from backend.job_manager import Job, job_manager

load_dotenv('.env.server')

app = FastAPI(title='Account Health API')
frontend_origin = os.getenv('FRONTEND_ORIGIN', 'http://localhost:5173')


def normalize_base_path(raw_value: str | None) -> str:
    if not raw_value or raw_value.strip() in {'', '/'}:
        return ''
    value = raw_value.strip()
    if not value.startswith('/'):
        value = f'/{value}'
    return value.rstrip('/')


APP_BASE_PATH = normalize_base_path(os.getenv('APP_BASE_PATH'))
API_PREFIX = f'{APP_BASE_PATH}/api' if APP_BASE_PATH else '/api'

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get(f'{API_PREFIX}/health')
def health() -> dict[str, object]:
    return {'ok': True, 'service': 'account-health-api-python'}


@app.get(f'{API_PREFIX}/dashboard/summary')
def summary_dashboard() -> dict[str, object]:
    return get_summary_dashboard_data()


@app.get(f'{API_PREFIX}/dashboard/debug')
def debug_dashboard() -> dict[str, object]:
    return get_summary_dashboard_debug()


@app.get(f'{API_PREFIX}/dashboard/account/{{account_id}}')
def account_dashboard(account_id: str) -> dict[str, object]:
    result = get_account_dashboard_data(account_id)
    if result.get('data') is None:
        raise HTTPException(status_code=404, detail='Account not found')
    return result


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/hostname-coverage')
def account_hostname_coverage(account_key: str) -> dict[str, object]:
    result = get_account_hostname_coverage(account_key)
    if result.get('data') is None:
        error_message = str(result.get('error') or 'Hostname coverage unavailable')
        if error_message.startswith('No mapping found') or error_message.startswith('No Akamai account matched'):
            raise HTTPException(status_code=404, detail=error_message)
        raise HTTPException(status_code=500, detail=error_message)
    return result


def _job_event_stream(job: Job) -> StreamingResponse:
    def event_stream():
        subscriber = job.subscribe()
        while True:
            entry = subscriber.get()
            if entry is None:
                break
            yield f'data: {json.dumps(entry)}\n\n'

    return StreamingResponse(event_stream(), media_type='text/event-stream')


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/hostname-cname-coverage/jobs')
def start_hostname_cname_coverage_job(account_key: str) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(job, lambda active_job: get_account_hostname_cname_coverage(account_key, active_job))
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/hostname-cname-coverage/jobs/{{job_id}}/events')
def stream_hostname_cname_coverage_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/hostMatrix/cname/jobs')
def start_hostname_cname_matrix_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_hostname_cname_matrix(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/hostMatrix/cname/jobs/{{job_id}}/events')
def stream_hostname_cname_matrix_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/hostMatrix/cname/summary/jobs')
def start_hostname_cname_matrix_summary_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_hostname_cname_matrix_summary(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/hostMatrix/cname/summary/jobs/{{job_id}}/events')
def stream_hostname_cname_matrix_summary_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/hostMatrix/cname/summary')
def hostname_cname_matrix_summary_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous summary endpoint (no job/SSE wrapper) for other components to consume directly."""
    try:
        return get_account_hostname_cname_matrix_summary(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/featureMatrix/jobs')
def start_feature_matrix_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_feature_matrix(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/featureMatrix/jobs/{{job_id}}/events')
def stream_feature_matrix_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/featureMatrix/summary/jobs')
def start_feature_matrix_summary_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_feature_matrix_summary(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/featureMatrix/summary/jobs/{{job_id}}/events')
def stream_feature_matrix_summary_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/featureMatrix/summary')
def feature_matrix_summary_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous summary endpoint (no job/SSE wrapper) for other components to consume directly."""
    try:
        return get_account_feature_matrix_summary(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/featureMatrix/scoreCard')
def feature_matrix_scorecard_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous scoreCard endpoint: featureName/count/properties JSON, no job/SSE wrapper."""
    try:
        return get_account_feature_matrix_scorecard(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/secHostCoverageMatrix/jobs')
def start_sec_host_coverage_matrix_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_sec_host_coverage_matrix(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/secHostCoverageMatrix/jobs/{{job_id}}/events')
def stream_sec_host_coverage_matrix_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/secHostCoverageMatrix/summary/jobs')
def start_sec_host_coverage_matrix_summary_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_sec_host_coverage_matrix_summary(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/secHostCoverageMatrix/summary/jobs/{{job_id}}/events')
def stream_sec_host_coverage_matrix_summary_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/secHostCoverageMatrix/summary')
def sec_host_coverage_matrix_summary_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous summary endpoint (no job/SSE wrapper) for other components to consume directly."""
    try:
        return get_account_sec_host_coverage_matrix_summary(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/secHostCoverageMatrix/scoreCard')
def sec_host_coverage_matrix_scorecard_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous scoreCard endpoint: configName/count/attackGroupAlert/attackGroupDeny JSON, no job/SSE wrapper."""
    try:
        return get_account_sec_host_coverage_matrix_scorecard(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/trafficMatrix/jobs')
def start_traffic_matrix_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_traffic_matrix(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/trafficMatrix/jobs/{{job_id}}/events')
def stream_traffic_matrix_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/trafficMatrix/summary/jobs')
def start_traffic_matrix_summary_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_traffic_matrix_summary(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/trafficMatrix/summary/jobs/{{job_id}}/events')
def stream_traffic_matrix_summary_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/trafficMatrix/summary')
def traffic_matrix_summary_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous summary endpoint (no job/SSE wrapper) for other components to consume directly."""
    try:
        return get_account_traffic_matrix_summary(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/trafficMatrix/scoreCard')
def traffic_matrix_scorecard_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous scoreCard endpoint: totals/hostnames JSON, no job/SSE wrapper."""
    try:
        return get_account_traffic_matrix_scorecard(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrix/jobs')
def start_perf_matrix_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_perf_matrix(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrix/jobs/{{job_id}}/events')
def stream_perf_matrix_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrix/summary/jobs')
def start_perf_matrix_summary_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_perf_matrix_summary(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrix/summary/jobs/{{job_id}}/events')
def stream_perf_matrix_summary_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrix/summary')
def perf_matrix_summary_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous summary endpoint (no job/SSE wrapper) for other components to consume directly."""
    try:
        return get_account_perf_matrix_summary(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrix/scoreCard')
def perf_matrix_scorecard_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous scoreCard endpoint: totals/hostnames JSON, no job/SSE wrapper."""
    try:
        return get_account_perf_matrix_scorecard(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrixTopN/jobs')
def start_perf_matrix_topn_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_perf_matrix_topn(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrixTopN/jobs/{{job_id}}/events')
def stream_perf_matrix_topn_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.post(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrixTopN/summary/jobs')
def start_perf_matrix_topn_summary_job(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
) -> dict[str, object]:
    job = job_manager.create()
    job_manager.run_in_background(
        job, lambda active_job: get_account_perf_matrix_topn_summary(account_key, data, active_job, context)
    )
    return {'jobId': job.job_id}


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrixTopN/summary/jobs/{{job_id}}/events')
def stream_perf_matrix_topn_summary_job(account_key: str, job_id: str) -> StreamingResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found')
    return _job_event_stream(job)


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrixTopN/summary')
def perf_matrix_topn_summary_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous summary endpoint (no job/SSE wrapper) for other components to consume directly."""
    try:
        return get_account_perf_matrix_topn_summary(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.get(f'{API_PREFIX}/dashboard/account/{{account_key}}/perfMatrixTopN/scoreCard')
def perf_matrix_topn_scorecard_json(
    account_key: str,
    data: str = Query('csv_data_local', pattern='^(csv_data_local|csv_data_remote)$'),
    context: str | None = Query(None),
    jsonOut: bool = Query(True),
) -> dict[str, object]:
    """Synchronous scoreCard endpoint: totals/hostnames JSON, no job/SSE wrapper."""
    try:
        return get_account_perf_matrix_topn_scorecard(account_key, data, None, context)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


DIST_DIR = Path(__file__).resolve().parent.parent / 'dist'
ASSETS_DIR = DIST_DIR / 'assets'

if DIST_DIR.exists():
    if ASSETS_DIR.exists():
        assets_mount = f'{APP_BASE_PATH}/assets' if APP_BASE_PATH else '/assets'
        app.mount(assets_mount, StaticFiles(directory=ASSETS_DIR), name='assets')

    if APP_BASE_PATH:
        @app.get(APP_BASE_PATH)
        def serve_prefixed_root() -> FileResponse:
            return FileResponse(DIST_DIR / 'index.html')


        @app.get(f'{APP_BASE_PATH}/{{full_path:path}}')
        def serve_prefixed_spa(full_path: str) -> FileResponse:
            candidate = DIST_DIR / full_path
            if candidate.exists() and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(DIST_DIR / 'index.html')
