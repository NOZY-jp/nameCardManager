from fastapi import Depends
from sqlalchemy.orm import Session
from db import get_db as get_db_session

get_db = get_db_session
