from gradio_client import Client

try:
    print("Testing Enhance-This...")
    client = Client("radames/Enhance-This")
    endpoints = client.view_api(return_format="dict")
    print("Success! Available endpoints:")
    for k in endpoints:
        print(k)
except Exception as e:
    print("Error:", e)
