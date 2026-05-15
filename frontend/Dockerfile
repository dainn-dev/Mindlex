# ---- Build stage ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /src

# Install deps. Try `npm ci` first for reproducible builds; if the lockfile
# is out of sync with package.json (e.g. after adding @types/node), fall
# back to `npm install` so the build doesn't fail.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci || npm install ; \
    else \
      npm install ; \
    fi

# Build with VITE_API_BASE_URL baked in.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
RUN npm run build

# ---- Runtime stage (nginx serves static + proxies /api → backend) ---------
FROM nginx:1.27-alpine AS runtime
RUN apk add --no-cache curl
COPY --from=build /src/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
