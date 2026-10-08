"""add calorie_goal to user_profiles

Revision ID: b2d4f6a8c013
Revises: a7c3e91d2b40
Create Date: 2026-10-08 23:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2d4f6a8c013'
down_revision = 'a7c3e91d2b40'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_profiles', schema=None) as batch_op:
        batch_op.add_column(sa.Column('calorie_goal', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('user_profiles', schema=None) as batch_op:
        batch_op.drop_column('calorie_goal')
