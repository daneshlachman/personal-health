"""add nutrition_day_status

Revision ID: a9c1e3f5b659
Revises: f8b0d2e4a548
Create Date: 2026-11-03 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a9c1e3f5b659'
down_revision = 'f8b0d2e4a548'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'nutrition_day_status',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('complete', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'date', name='uq_nutrition_day_status_user_date'),
    )


def downgrade():
    op.drop_table('nutrition_day_status')
