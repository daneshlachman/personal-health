"""add sleep_json to whoop_data

Revision ID: f8b0d2e4a548
Revises: e7a9c1d3f437
Create Date: 2026-11-03 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f8b0d2e4a548'
down_revision = 'e7a9c1d3f437'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('whoop_data', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sleep_json', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('whoop_data', schema=None) as batch_op:
        batch_op.drop_column('sleep_json')
