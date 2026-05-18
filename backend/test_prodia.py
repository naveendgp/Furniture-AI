import os
from gradio_client import Client, handle_file

try:
    print("Testing prodia...")
    client = Client("prodia/fast-stable-diffusion")
    
    # We need to know what endpoints it has
    endpoints = client.view_api(return_format="dict")
    print(endpoints)
except Exception as e:
    print("Error:", e)
