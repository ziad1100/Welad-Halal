FROM node:22-alpine AS build
ARG GIT_SHA=dev
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
WORKDIR /app
COPY package.json ./
# Runtime needs the Prisma CLI for `migrate deploy` in CMD below, but it ships
# as a devDependency — reinstall the pinned version without saving it.
RUN npm install --omit=dev && npm install @prisma/client && npm install --no-save "prisma@$(node -p "require('./package.json').devDependencies.prisma")"
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
