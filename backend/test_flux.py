import os
from gradio_client import Client

client = Client("black-forest-labs/FLUX.1-schnell", httpx_kwargs={"timeout": 10.0})
print(client.view_api(return_format="dict"))
