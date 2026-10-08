FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (layer cached separately from code)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

ENV FLASK_ENV=production
ENV PORT=8000

EXPOSE 8000

# Run migrations then start gunicorn
CMD ["sh", "-c", "flask db upgrade && gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 2 --timeout 180"]
