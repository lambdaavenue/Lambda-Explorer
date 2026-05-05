FROM node:14.8.0

RUN groupadd -r explorer && useradd -mrg explorer -s /bin/bash explorer
RUN mkdir /block-explorer
WORKDIR /block-explorer
COPY . .
RUN chown -R explorer:explorer /block-explorer
USER explorer
ENV HOME=/home/explorer

# Set up global npm for unprivileged user
WORKDIR ${HOME}
RUN mkdir .local
RUN npm set prefix ${HOME}/.local
ENV PATH=${PATH}:${HOME}/.local/bin
ENV NODE_ENV=production

WORKDIR /block-explorer
RUN npm install

ENTRYPOINT ["./bin/cli.js"]
