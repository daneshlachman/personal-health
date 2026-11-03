"""adaptive tdee and macro goals on user_profiles

Revision ID: b0d2f4a6c760
Revises: a9c1e3f5b659
Create Date: 2026-11-03 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b0d2f4a6c760'
down_revision = 'a9c1e3f5b659'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_profiles', schema=None) as batch_op:
        batch_op.add_column(sa.Column('adaptive_tdee', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('tdee_factor', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('tdee_factor_updated', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('protein_goal_g', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('fat_goal_g', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('user_profiles', schema=None) as batch_op:
        batch_op.drop_column('fat_goal_g')
        batch_op.drop_column('protein_goal_g')
        batch_op.drop_column('tdee_factor_updated')
        batch_op.drop_column('tdee_factor')
        batch_op.drop_column('adaptive_tdee')
