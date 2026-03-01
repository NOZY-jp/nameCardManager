"""drop contact_methods label column

Revision ID: c414b17733a1
Revises: 468f71c4ab75
Create Date: 2026-03-01 17:29:36.711495

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c414b17733a1"
down_revision: str | Sequence[str] | None = "468f71c4ab75"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("contact_methods", "label")


def downgrade() -> None:
    op.add_column(
        "contact_methods",
        sa.Column("label", sa.String(length=50), nullable=False),
    )
