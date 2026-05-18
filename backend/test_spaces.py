import os
from gradio_client import Client, handle_file

spaces_to_test = [
    "gokaygokay/SDXL-ControlNet-Lineart",
    "black-forest-labs/FLUX.1-dev",
    "KBlueLeaf/SDXL-Img2Img-ControlNet",
    "tencent/HunyuanVideo" # Just seeing if any space works
]

for space in spaces_to_test:
    try:
        print(f"Testing {space}...")
        client = Client(space, httpx_kwargs={"timeout": 10.0})
        print(f"✅ {space} is UP!")
    except Exception as e:
        print(f"❌ {space} failed:", str(e)[:100])
