FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# the pnpm version CI uses too, from packageManager in package.json
RUN npm install -g "$(node -p "require('./package.json').packageManager")"
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src src
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
# only the headless shell of Chromium, with the system libraries it needs; before the code,
# so this layer stays cached until the dependencies change
RUN node_modules/.bin/playwright install --with-deps chromium-headless-shell \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist dist
USER node
ENTRYPOINT ["node", "dist/cli.js"]
