import os
from huggingface_hub import InferenceClient

HF_TOKEN = "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"

client = InferenceClient(model="stabilityai/stable-diffusion-xl-base-1.0", token=HF_TOKEN)

try:
    print("Testing inference client...")
    # We just want to see if the model accepts requests
    res = client.text_to_image("a simple room", width=512, height=512)
    print("Success!", type(res))
except Exception as e:
    print("Error:", e)
