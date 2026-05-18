import os
from huggingface_hub import InferenceClient

HF_TOKEN = "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"

client = InferenceClient(model="stable-diffusion-v1-5/stable-diffusion-v1-5", token=HF_TOKEN)

try:
    print("Testing inference client img2img...")
    with open("c:/Users/navee/Desktop/Naveen/WebDev/Projects/Furniture AI/backend/uploads/enhanced/e935e5af_input.png", "rb") as f:
        img_bytes = f.read()
    
    res = client.image_to_image(
        image=img_bytes, 
        prompt="photorealistic interior design render",
        strength=0.35,
        guidance_scale=7.5
    )
    print("Success!", type(res))
except Exception as e:
    import traceback
    traceback.print_exc()
