# ---- Build stage ----------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Optional private NuGet feed auth — provided as build args. Skipped when blank.
ARG NUGET_FEED_URL=
ARG NUGET_USERNAME=
ARG NUGET_PAT=

RUN if [ -n "$NUGET_FEED_URL" ]; then \
      dotnet nuget add source "$NUGET_FEED_URL" \
        --name private \
        --username "$NUGET_USERNAME" \
        --password "$NUGET_PAT" \
        --store-password-in-clear-text ; \
    fi

# Restore deps first for layer caching.
COPY Mindlex.csproj ./
RUN dotnet restore Mindlex.csproj

# Copy the rest and publish.
COPY . .
RUN dotnet publish Mindlex.csproj -c Release -o /app/publish --no-restore

# ---- Runtime stage --------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# curl for healthchecks; tini for proper PID 1 signal handling.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tini \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish ./

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD curl -fsS http://localhost:8080/swagger/index.html || exit 1

ENTRYPOINT ["tini", "--", "dotnet", "Mindlex.dll"]
