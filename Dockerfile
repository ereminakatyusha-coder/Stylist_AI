FROM node:18-alpine
WORKDIR /app
COPY package.json .
COPY server.js .
COPY client-form/ ./client-form/
COPY questionnaire/ ./questionnaire/
COPY editor/ ./editor/
COPY index.html .
EXPOSE 3000
CMD ["node", "server.js"]
