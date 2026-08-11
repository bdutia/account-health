import requests
import json
import time

def get_web_performance_data(hostname, api_key):
    """
    Attempts to gather real-user CrUX metric payload data first.
    If the domain results in a 404 error, falls back to the 
    PageSpeed Insights API to calculate synthetic Lighthouse scores.
    """
    print(f"--- Initiating analysis for: {hostname} ---")
    
    # ----------------------------------------------------
    # PHASE 1: Attempt CrUX API Data Retrieval
    # ----------------------------------------------------
    #crux_url = f"https://googleapis.com{api_key}"
    crux_url = f"https://chromeuxreport.googleapis.com/v1/records:queryRecord?key={api_key}"
    # Corrected modern payload framework (strictly omitting first_input_delay)
    crux_payload = {
        "origin": f"https://{hostname}",
        "metrics": [
            "largest_contentful_paint",
            "interaction_to_next_paint",
            "cumulative_layout_shift"
        ]
    }
    
    try:
        crux_response = requests.post(crux_url, json=crux_payload, timeout=15)
        
        if crux_response.status_code == 200:
            print("✔ Success: Found real-user CrUX field data.")
            metrics = crux_response.json().get('record', {}).get('metrics', {})
            
            # Simple formatting extraction helper for CrUX histograms
            return {
                "source": "CrUX API (Real-User Field Data)",
                "data": {
                    "LCP_p75_ms": metrics.get("largest_contentful_paint", {}).get("percentiles", {}).get("p75"),
                    "INP_p75_ms": metrics.get("interaction_to_next_paint", {}).get("percentiles", {}).get("p75"),
                    "CLS_p75": metrics.get("cumulative_layout_shift", {}).get("percentiles", {}).get("p75")
                }
            }
            
        elif crux_response.status_code == 404:
            print("⚠ Notice: 404 Not Found in CrUX (Insufficient traffic domain).")
            print("🔄 Activating Fallback Strategy: Requesting PageSpeed Insights Lab Audit...")
            return None
            
        else:
            print(f"❌ CrUX HTTP Error {crux_response.status_code}: {crux_response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Connection error during CrUX lookup: {e}")
        return None


def run_pagespeed_fallback(hostname, api_key):
    """
    Triggers an on-demand Lighthouse laboratory analysis via the 
    PageSpeed Insights API. Note: Live runs can take 15-60 seconds.
    """
    # Build complete destination target URL string 
    target_url = f"https://www.{hostname}" if not hostname.startswith("www.") else f"https://{hostname}"
    
    psi_endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
    
    # Query parameters configuration (Strategy can be 'mobile' or 'desktop')
    params = {
        "url": target_url,
        "key": api_key,
        "strategy": "mobile",
        "category": "performance"
    }
    
    try:
        # High timeout value required as Lighthouse simulates actual device processing speeds
        response = requests.get(psi_endpoint, params=params, timeout=90)
        
        if response.status_code == 200:
            res_data = response.json()
            lh_result = res_data.get("lighthouseResult", {})
            
            # Extract standard scores and performance timings
            perf_score = lh_result.get("categories", {}).get("performance", {}).get("score", 0) * 100
            audits = lh_result.get("audits", {})
            
            return {
                "source": "PageSpeed Insights API (Synthetic Lab Fallback)",
                "data": {
                    "overall_performance_score": round(perf_score, 1),
                    "LCP_lab_value": audits.get("largest-contentful-paint", {}).get("displayValue"),
                    "Total_Blocking_Time": audits.get("total-blocking-time", {}).get("displayValue"),
                    "Speed_Index": audits.get("speed-index", {}).get("displayValue")
                }
            }
        else:
            print(f"❌ PageSpeed Fallback Failed with code {response.status_code}: {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Connection error during PageSpeed simulation: {e}")
        return None

# ----------------------------------------------------
# Execution Block
# ----------------------------------------------------
API_KEY = "AIzaSyAVRy5mruWdsY0B4EJu_XC3LTGspgT2clo"

# Test 1: Querying a major domain likely to have traffic data in CrUX
crux_success_test = get_web_performance_data("www.chrysler.com", API_KEY)
print(json.dumps(crux_success_test, indent=4))

print("\n" + "="*50 + "\n")

# Test 2: Querying an internal or low-traffic asset to watch fallback trigger
#fallback_test = get_web_performance_data("a-low-traffic-example-website.com", API_KEY)
#print(json.dumps(fallback_test, indent=4))
