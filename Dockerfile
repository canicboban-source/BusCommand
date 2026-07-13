# BusCommand — production image (Node API + Vite dist)
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Render prosleđuje NODE_ENV=production u build — mora devDeps (vite) za npm run build
ENV NODE_ENV=development
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8766
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY api-server.js ./
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 8766
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8766)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "api-server.js"]
