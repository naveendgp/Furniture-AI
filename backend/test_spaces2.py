import os
from gradio_client import Client

spaces_to_test = [
    "KBlueLeaf/SDXL-Img2Img-ControlNet",
    "tencent/HunyuanVideo",
    "black-forest-labs/FLUX.1-schnell",
    "spaces/radames/Enhance-This"
]

for space in spaces_to_test:
    try:
        print(f"Testing {space}...")
        client = Client(space, httpx_kwargs={"timeout": 10.0})
        print(f"SUCCESS: {space} is UP!")
    except Exception as e:
        print(f"FAIL {space}:", str(e)[:100])
