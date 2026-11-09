"""add hidden to workouts

Revision ID: c1e3f5a7b871
Revises: b0d2f4a6c760
Create Date: 2026-11-09 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1e3f5a7b871'
down_revision = 'b0d2f4a6c760'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('workouts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('hidden', sa.Boolean(), nullable=True))


def downgrade():
    with op.batch_alter_table('workouts', schema=None) as batch_op:
        batch_op.drop_column('hidden')
