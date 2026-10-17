FROM node:22-bookworm-slim
RUN npm install -g wrangler@4.92.0
WORKDIR /app
COPY dist ./dist
COPY drizzle ./drizzle
COPY server-deploy/wrangler.server.jsonc ./wrangler.jsonc
COPY server-deploy/import.sql ./import.sql
COPY server-deploy/entrypoint.sh ./entrypoint.sh
RUN chmod 755 /app/entrypoint.sh
EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["/app/entrypoint.sh"]

