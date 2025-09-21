FROM node:24

COPY . /usr/src

WORKDIR /usr/src

RUN npm install

RUN npm run build

CMD ["npm", "start"]