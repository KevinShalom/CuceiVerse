FROM node:20-bullseye-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npm run db:generate && npm run db:migrate:deploy && npm run db:seed && npm run start"]
