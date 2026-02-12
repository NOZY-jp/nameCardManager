from fastapi import APIRouter
from api.v1 import namecards

api_router = APIRouter()

api_router.include_router(namecards.router, prefix="/namecards", tags=["namecards"])
