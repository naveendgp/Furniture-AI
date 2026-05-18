import os
import io
from PIL import Image
from huggingface_hub import InferenceClient

HF_TOKEN = "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"
client = InferenceClient(model="runwayml/stable-diffusion-v1-5", token=HF_TOKEN)

try:
    print("Testing resized image...")
    # Open and resize
    img = Image.open("c:/Users/navee/Desktop/Naveen/WebDev/Projects/Furniture AI/backend/uploads/enhanced/e935e5af_input.png").convert("RGB")
    
    # Resize to max 768 to avoid payload limits
    img.thumbnail((768, 768), Image.Resampling.LANCZOS)
    
    # Save to bytes
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG', quality=85)
    img_bytes = img_byte_arr.getvalue()
    
    print(f"Sending {len(img_bytes)} bytes...")
    
    res = client.image_to_image(
        image=img_bytes, 
        prompt="photorealistic interior design render",
        strength=0.35,
        guidance_scale=7.5
    )
    print("Success!", type(res))
    res.save("test_out.jpg")
except Exception as e:
    import traceback
    traceback.print_exc()
