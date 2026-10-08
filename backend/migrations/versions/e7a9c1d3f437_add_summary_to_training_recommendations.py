"""add summary to training_recommendations

Revision ID: e7a9c1d3f437
Revises: d5f7b9c1e326
Create Date: 2026-10-09 00:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e7a9c1d3f437'
down_revision = 'd5f7b9c1e326'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('training_recommendations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('summary', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('training_recommendations', schema=None) as batch_op:
        batch_op.drop_column('summary')
