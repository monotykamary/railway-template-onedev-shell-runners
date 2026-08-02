FROM node:22.23.2-alpine
WORKDIR /app
COPY package.json planner.js index.js ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
