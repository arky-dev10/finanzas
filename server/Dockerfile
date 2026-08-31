# node:26 trae node:sqlite estable y ejecuta TypeScript sin build.
# slim y no alpine: @node-rs/argon2 resuelve el binario de glibc sin compilar.
FROM node:26-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# La base vive en un volumen: sin esto, cada redeploy borra las cuentas.
ENV DB_PATH=/data/kumi.db
VOLUME /data
EXPOSE 8787

USER node
CMD ["node", "src/index.ts"]
