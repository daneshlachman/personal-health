"""add goals to user_profiles

Revision ID: c4e6a8b0d215
Revises: b2d4f6a8c013
Create Date: 2026-10-08 23:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e6a8b0d215'
down_revision = 'b2d4f6a8c013'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_profiles', schema=None) as batch_op:
        batch_op.add_column(sa.Column('goals', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('user_profiles', schema=None) as batch_op:
        batch_op.drop_column('goals')
