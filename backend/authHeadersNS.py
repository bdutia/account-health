import os
from pathlib import Path

from akamai.netstorage import Netstorage
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env.server")


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


NS_HOSTNAME = require_env("NS_HOSTNAME")
NS_KEYNAME = require_env("NS_KEYNAME")
NS_KEY = require_env("NS_KEY")
CP_CODE = require_env("NS_CP_CODE")
NS_BASE_PATH = os.getenv("NS_BASE_PATH", "").strip().strip("/")

REMOTE_DIR = "/" + "/".join(part for part in [CP_CODE, NS_BASE_PATH] if part)
REMOTE_FILE_PATH = f"{REMOTE_DIR}/sample_data.txt"

LOCAL_UPLOAD_SOURCE = "local_file.txt"
LOCAL_DOWNLOAD_DEST = "sample_data.txt"

def setup_dummy_file():
    """Creates a local file if it doesn't exist for the test run."""
    if not os.path.exists(LOCAL_UPLOAD_SOURCE):
        with open(LOCAL_UPLOAD_SOURCE, "w") as f:
            f.write("Hello Akamai NetStorage! This is a secure file upload test.")
        print(f"Created local test file: {LOCAL_UPLOAD_SOURCE}")

def main():
    setup_dummy_file()

    print("Connecting to Akamai NetStorage Service...")
    ns = Netstorage(NS_HOSTNAME, NS_KEYNAME, NS_KEY)
    
    # 3. Create the remote directory if needed (optional)
    print(f"Ensuring remote directory exists: {REMOTE_DIR}")
    try:
        # Note: mkdir will throw an error if the directory already exists
        ns.mkdir(REMOTE_DIR)
        print("Directory created successfully.")
    except Exception:
        print("Directory already exists or could not be created. Proceeding...")

        # 4. Upload a File (action=upload)
    print(f"\n[UPLOAD] Uploading '{LOCAL_UPLOAD_SOURCE}' to NetStorage path '{REMOTE_FILE_PATH}'...")
    try:
        # The official SDK method returns a SINGLE boolean value, NOT a tuple
        success = ns.upload(LOCAL_UPLOAD_SOURCE, REMOTE_FILE_PATH)
        
        if success:
            print(" Upload Complete! NetStorage confirmed file creation.")
        else:
            print("❌ Upload Failed. Check file paths, CP code permissions, or key credentials.")
            return
    except Exception as e:
        print(f"❌ Critical exception during upload: {e}")
        return



        # 5. Download the File (action=download)
    print(f"\n[DOWNLOAD] Downloading '{REMOTE_FILE_PATH}' to local destination '{LOCAL_DOWNLOAD_DEST}'...")
    try:
        # Corrected to a single return value
        success = ns.download(REMOTE_FILE_PATH, LOCAL_DOWNLOAD_DEST)
        
        if success:
            print(f" Download Complete! Local file verified at: {LOCAL_DOWNLOAD_DEST}")
            # Quick verification check
            with open(LOCAL_DOWNLOAD_DEST, "r") as f:
                print(f"Downloaded Content Preview: '{f.read()}'")
        else:
            print("❌ Download Failed. The file might not exist on the remote path.")
    except Exception as e:
        print(f"❌ Critical exception during download: {e}")


if __name__ == "__main__":
    main()
