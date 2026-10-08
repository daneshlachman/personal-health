"""add training_recommendations

Revision ID: d5f7b9c1e326
Revises: c4e6a8b0d215
Create Date: 2026-10-08 23:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd5f7b9c1e326'
down_revision = 'c4e6a8b0d215'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'training_recommendations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_training_recommendations_date', 'training_recommendations', ['date'])


def downgrade():
    op.drop_index('ix_training_recommendations_date', table_name='training_recommendations')
    op.drop_table('training_recommendations')
