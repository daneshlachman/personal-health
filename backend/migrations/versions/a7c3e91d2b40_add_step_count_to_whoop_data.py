"""add step_count to whoop_data

Revision ID: a7c3e91d2b40
Revises: fceb519ee51b
Create Date: 2026-10-08 22:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7c3e91d2b40'
down_revision = 'fceb519ee51b'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('whoop_data', schema=None) as batch_op:
        batch_op.add_column(sa.Column('step_count', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('whoop_data', schema=None) as batch_op:
        batch_op.drop_column('step_count')
