FROM node:22

WORKDIR /app

COPY api/package*.json ./

RUN npm install

COPY api/*.js ./

COPY web ./web

EXPOSE 3000

CMD [ "npm", "start" ]
