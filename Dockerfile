# Aku, the Website Terminator — hardened PUBLIC hosted image.
# Base image ships Chromium + all system deps; tag must match the playwright version in package.json.
FROM mcr.microsoft.com/playwright:v1.64.1-noble
ENV NODE_ENV=production \
    AKU_PUBLIC=1 \
    AKU_HOST=0.0.0.0 \
    PORT=4000 \
    AKU_TRUST_PROXY=1 \
    AKU_NO_SANDBOX=1
# AKU_NO_SANDBOX: most free PaaS hosts block Chromium's user-namespace sandbox. The container (non-root user,
# no secrets, all browser traffic forced through Aku's SSRF-guarding proxy) is the isolation boundary instead.
# Remove it if your host allows the sandbox (docker run --security-opt seccomp=<playwright seccomp profile>).
# AKU_TRUST_PROXY=1 is correct behind Render/Cloud Run/etc. (X-Forwarded-For set by the platform). Unset it if exposed directly.
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=pwuser:pwuser . .
RUN mkdir -p out && chown pwuser:pwuser out
USER pwuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node","ui/server.js"]
