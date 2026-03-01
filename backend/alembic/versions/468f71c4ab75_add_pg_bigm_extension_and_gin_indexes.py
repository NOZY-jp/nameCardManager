"""add pg_bigm extension and GIN indexes

Revision ID: 468f71c4ab75
Revises: af449d9de538
Create Date: 2026-03-01 17:29:08.111762

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "468f71c4ab75"
down_revision: str | Sequence[str] | None = "af449d9de538"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_bigm")

    op.execute(
        "CREATE INDEX ix_name_cards_last_name_bigm "
        "ON name_cards USING gin (last_name gin_bigm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_name_cards_first_name_bigm "
        "ON name_cards USING gin (first_name gin_bigm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_name_cards_last_name_kana_bigm "
        "ON name_cards USING gin (last_name_kana gin_bigm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_name_cards_first_name_kana_bigm "
        "ON name_cards USING gin (first_name_kana gin_bigm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_name_cards_notes_bigm "
        "ON name_cards USING gin (notes gin_bigm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_name_cards_met_notes_bigm "
        "ON name_cards USING gin (met_notes gin_bigm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_name_cards_met_notes_bigm")
    op.execute("DROP INDEX IF EXISTS ix_name_cards_notes_bigm")
    op.execute("DROP INDEX IF EXISTS ix_name_cards_first_name_kana_bigm")
    op.execute("DROP INDEX IF EXISTS ix_name_cards_last_name_kana_bigm")
    op.execute("DROP INDEX IF EXISTS ix_name_cards_first_name_bigm")
    op.execute("DROP INDEX IF EXISTS ix_name_cards_last_name_bigm")
    op.execute("DROP EXTENSION IF EXISTS pg_bigm")
