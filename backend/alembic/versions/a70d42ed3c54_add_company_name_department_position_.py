"""add company_name department position and rename notes to memo

Revision ID: a70d42ed3c54
Revises: c414b17733a1
Create Date: 2026-03-02 19:38:53.876116

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a70d42ed3c54"
down_revision: Union[str, Sequence[str], None] = "c414b17733a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "name_cards", sa.Column("company_name", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "name_cards", sa.Column("department", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "name_cards", sa.Column("position", sa.String(length=200), nullable=True)
    )
    # notes → memo にリネーム（データ保持）
    op.alter_column("name_cards", "notes", new_column_name="memo")


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("name_cards", "memo", new_column_name="notes")
    op.drop_column("name_cards", "position")
    op.drop_column("name_cards", "department")
    op.drop_column("name_cards", "company_name")
