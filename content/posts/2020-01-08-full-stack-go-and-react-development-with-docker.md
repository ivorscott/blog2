---
template: post
title: Full Stack Go and React Development with Docker
slug: fullstack-go-react-development-with-docker
draft: true
date: 2020-01-08T12:54:37.547Z
description: Build a fullstack go and react developer environment with docker.
category: development
tags:
  - Delve Docker Golang Makefile Postgres Traefik VSCode
---
# Introduction

I expect you to be familiar with go and react. I won't teach you how to make a react app or a go api, rather we will focus our attention on building docker tooling around an existing full stack sample project.

At the end of this tutorial you will create the ultimate Go and React development environment with Docker. 

# Contents

* Setting Up VSCode
* Building Images
* Running Containers
* Live Reloading A Go API
* Delve Debugging A Go API
* Self-Signed Certificates With Traefik
* Running Tests

## Requirements

* [VSCode](https://code.visualstudio.com/)
* [Docker](https://www.docker.com/products/docker-desktop)

# Setting up VSCode

Download VSCode if you haven't already (its free). Then install the following extensions:

1. [The Go Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.Go) 
   Adds rich language support for the Go language.
2. [The Docker Extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker) \
   Adds syntax highlighting, commands, hover tips, and linting for docker related files.

Clone [the project repo](https://github.com/ivorscott/go-delve-reload) and checkout out the `starter` branch if you haven't already. 

```
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout starter
```

Create a hidden folder named `.vscode` and add a file named `launch.json` under it.

```
mkdir .vscode
touch .vscode/launch.json
```

Add the following contents to `launch.json`.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch remote",
      "type": "go",
      "request": "attach",
      "mode": "remote",
      "cwd": "${workspaceFolder}/api",
      "remotePath": "/api",
      "port": 2345,
      "showLog": true,
      "trace": "verbose"
    }
  ]
}
```

The above config will allow VSCode to remotely attach to the delve debugger inside the api container. 

# Building Images

### Creating the Go API Dockerfile

Make a new `Dockerfile` for the `api` folder and open it in your editor. Add the following:

```
# 1. FROM sets the baseImage to use for subsequent instructions.
# Use the Golang image as the base stage of a multi-stage routine
FROM golang:1.13.5 as base

# 2. WORKDIR sets the working directory for any subsequent COPY, CMD, or RUN instructions
# Change directory
WORKDIR /api

# 3. COPY copy files or folders from source to the destination path in the image's filesystem
# Copy the api code into /api in the image's filesystem
COPY . . 

# 4. RUN executes commands on top of the current image as a new layer and commit the results.
# Install go module dependencies in the image's filesystem
RUN go mod download

# 5. Extend the base stage to create a new stage named dev
FROM base as dev

# 6. ENV sets an environment variable
# Create GOPATH and PATH Environment variables
ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH

# 7. Change directory
WORKDIR $GOPATH/src

# 8. Install development dependencies in $GOPATH/src
RUN go get github.com/go-delve/delve/cmd/dlv
RUN go get github.com/githubnemo/CompileDaemon

# 9. Change directory
WORKDIR /api

# 10. Provide meta data about the ports the container must EXPOSE
# port 4000 -> api port
# port 2345 -> debugger port
EXPOSE 4000 2345

# 11. CMD provide defaults for an executing container.
CMD ["go", "run" "./cmd/api"]
```

### Demo

In the root directory run the following:

```
docker build --target dev --tag demo/api ./api
```

The `docker build` command builds the a new docker image referencing the Dockerfile inside the api folder. 

The flag `--target` specifies that we only want to target the `dev` stage in the multi-stage setup.

[Multi-stage](https://docs.docker.com/develop/develop-images/multistage-build/) builds help us apply separation of concerns. A multi-stage setup allows you to define different stages of a single Dockerfile and reference them later. In our api Dockerfile, we declared the name of our first stage `as base`.

The flag `--tag` specifies an [image tag](https://docs.docker.com/engine/reference/commandline/tag/) or name we can use to reference the new image, it is tagged `demo/api`.

If you publish a private or public image to [DockerHub](https://hub.docker.com/) (the official Docker image repository) the format DockerHub expects is username/image-name. Since we are not publishing images in this tutorial `demo` doesn't have to be your real username.

### Creating the React app Dockerfile

Add a new `Dockerfile` for the client folder. Open it in your editor. Add the following contents:

```
# 1. Use the Node image as the base stage of a multi-stage routine
FROM node:10.15.0-alpine as base

# 2. Set the NODE_ENV Environment variable
ENV NODE_ENV=production

# 3. Set the working directory
WORKDIR /client

# 4. Copy both package.json and package-lock.json into /client in the image's filesystem
COPY package*.json ./

# 5. Install the production node_modules and clean up the cache 
RUN npm ci \ 
    && npm cache clean --force

# 5. Extend the base stage to create a new stage named dev
FROM base as dev

# 6. Set the NODE_ENV and PATH Environment variables
ENV NODE_ENV=development
ENV PATH /client/node_modules/.bin:$PATH

# 7. Provide meta data about the port the container must EXPOSE
EXPOSE 3000

# 8. Create a new directory and recursively change the ownership to the node user
RUN mkdir /client/app && chown -R node:node .

# 9. Switch to the node user
USER node

# 10. Install development dependencies
RUN npm i --only=development \
    && npm cache clean --force

# 11. Patch create-react-app bug preventing self-signed certificate usage
# https://github.com/facebook/create-react-app/issues/8075
COPY patch.js /client/node_modules/react-dev-utils/webpackHotDevClient.js

# 12. Print npm config for debugging purposes
RUN npm config list

# 13. Change directory
WORKDIR /client/app

# 14. Provide defaults for an executing container. 
CMD ["npm", "run", "start"]

# 15. Extend the dev stage and create a new stage called test
FROM dev as test

# 16. Copy the remainder of the client folder source code into the image filesystem
COPY . .

# 17. Run node_module vulnerability checks
RUN npm audit

# 18. Extend the test stage to create a new stage named build-stage
FROM test as build-stage

# 19. Build the production static assets
RUN npm run build

# 20. Extend Nginx image to create a new stage named prod
FROM nginx:1.15-alpine as prod

# 21. Provide meta data about the port the container must EXPOSE
EXPOSE 80

# 22. Copy only the files we want from the build stage into the prod stage
COPY --from=build-stage /client/app/build /usr/share/nginx/html
COPY --from=build-stage /client/app/nginx.conf /etc/nginx/conf.d/default.conf
```

# Running Containers

Docker compose is a command line tools and configuration file that uses YAML. It is only meant for local development and test automation. For production you are better off using a production grade orchestrator like Docker Swarm or Kubernetes.

With Docker Compose we can run a collection of containers with one command which becomes necessary when containers have relationships and depend on one another.

In the project root, create a `docker-compose.yml` file and open it.

```
touch docker-compose.yml        
```

Add the following content:

```
version: "3.7"
services:
  traefik:
    image: traefik:v2.1.1
    command:
      - "--api.insecure=true" # Not For Production
      - "--api.debug=true"
      - "--log.level=DEBUG"
      - "--providers.docker"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=traefik-public"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - 80:80
      - 443:443
      - 8080:8080
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro

    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik.tls=true"
      - "traefik.http.routers.traefik.rule=Host(`traefik.api.local`)"
      - "traefik.http.routers.traefik.service=api@internal"
      - "traefik.http.routers.http-catchall.rule=hostregexp(`{host:.+}`)"
      - "traefik.http.routers.http-catchall.entrypoints=web"
      - "traefik.http.routers.http-catchall.middlewares=redirect-to-https@docker"
      - "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"
  api:
    build:
      context: ./api
      target: dev
    secrets:
      - postgres_db
      - postgres_user
      - postgres_passwd
    environment:
      ADDR_PORT: 4000
      POSTGRES_HOST: db
      POSTGRES_DB: /run/secrets/postgres_db
      POSTGRES_USER: /run/secrets/postgres_user
      POSTGRES_PASSWORD: /run/secrets/postgres_passwd
    volumes:
      - ./api:/api
    networks:
      - postgres
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.tls=true"
      - "traefik.http.routers.api.rule=Host(`api.local`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.services.debug-api.loadbalancer.server.port=4000"
    command: CompileDaemon --build="go build -o main ./cmd/api" --command=./main

  client:
    build:
      context: ./client
      target: dev
    ports:
      - 3000:3000
    volumes:
      - ./client:/client/app
      - /client/app/node_modules
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.client.tls=true"
      - "traefik.http.routers.client.rule=Host(`client.local`)"
      - "traefik.http.routers.client.entrypoints=websecure"
      - "traefik.http.services.client.loadbalancer.server.port=3000"

  debug-api:
    build:
      context: ./api
      target: dev
    secrets:
      - postgres_db
      - postgres_user
      - postgres_passwd
    environment:
      ADDR_PORT: 8888
      POSTGRES_HOST: db
      POSTGRES_DB: /run/secrets/postgres_db
      POSTGRES_USER: /run/secrets/postgres_user
      POSTGRES_PASSWORD: /run/secrets/postgres_passwd
    ports:
      - 2345:2345
    networks:
      - postgres
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.debug-api.tls=true"
      - "traefik.http.routers.debug-api.rule=Host(`debug.api.local`)"
      - "traefik.http.routers.debug-api.entrypoints=websecure"
      - "traefik.http.services.debug-api.loadbalancer.server.port=8888"
    security_opt:
      - "seccomp:unconfined"
    tty: true
    stdin_open: true
    command: dlv debug --accept-multiclient --continue --headless --listen=:2345 --api-version=2 --log ./cmd/api/

  db:
    image: postgres:11.6
    container_name: db
    secrets:
      - postgres_db
      - postgres_user
      - postgres_passwd
    environment:
      POSTGRES_DB_FILE: /run/secrets/postgres_db
      POSTGRES_USER_FILE: /run/secrets/postgres_user
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_passwd
    ports:
      - 5432:5432
    volumes:
      - postgres:/var/lib/postgresql/data
      - ./api/scripts/:/docker-entrypoint-initdb.d/
    networks:
      - postgres

  pgadmin:
    image: dpage/pgadmin4
    environment:
      PGADMIN_DEFAULT_EMAIL: test@example.com
      PGADMIN_DEFAULT_PASSWORD: "SuperSecret"
    depends_on:
      - db
    networks:
      - postgres
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.pgadmin.tls=true"
      - "traefik.http.routers.pgadmin.rule=Host(`pgadmin.local`)"
      - "traefik.http.routers.pgadmin.entrypoints=websecure"
      - "traefik.http.services.pgadmin.loadbalancer.server.port=80"
    restart: unless-stopped

volumes:
  postgres:
    external: true

networks:
  postgres:
    external: true
  traefik-public:
    external: true

secrets:
  postgres_db:
    file: ./secrets/postgres_db
  postgres_passwd:
    file: ./secrets/postgres_passwd
  postgres_user:
    file: ./secrets/postgres_user
```

### Demo

```
docker-compose up
```

```
docker-compose down
```

# Makefiles

It's often a hassle to type all of the various docker commands even when you know them. GNU Make is an automation tool that can abstract away the commands for us.

The syntax is as follows:

```
target: prerequisite prerequisite prerequisite ...
(TAB) commands 
```

Targets that do not represent files are known as phony targets.

Phony targets are always executed. Since makefile can distinguish between a file target and a phony target conflicts may arise in development. For example, your in a directory with a file named test and inside a makefile in the same directory you have a target name test without prerequisites:

```
test: 
    echo test something
```

Running make test in this scenario may not work as you expect. The output of this command would be `test is up to date`. This is because GNU make sees the test file and then the target without prerequisites and determines that you don't have any commands to perform because everything is up to date. GNU is make does want to perform an unnecessary action. This is an intended optimization needed for compiling executables. Most of the time, if you are using GNU make to compile executable files you don't want to compile files that don't need to be compiled because they haven't changed.

You can by pass this by indicating that the target is a phony target. The phony target declaration can appear anywhere in the makefile, above or below the target it relates to.

```
test:
    echo test something

.PHONY: test
```

With this, `make test` finally runs the command, and no longer shows the test is up to date response.

Just remember it's only necessary to use `.PHONY: target` when there is a filename conflict with a target defined in a makefile. In the above example, if the test file didn't exist then there would had been no reason to apply .PHONY: test.  

Alright, that's it for makefiles. You can read more about PHONY Targets [here](https://www.gnu.org/software/make/manual/html_node/Phony-Targets.html). In this tutorial project you won't need them but you should be aware of them and how they work.

## Creating the Makefile

Create a `makefile` in your project root and open it. 

```
touch makefile
```

Add the following contents:

```
#!make

NETWORKS="$(shell docker network ls)"
VOLUMES="$(shell docker volume ls)"
POSTGRES_DB="$(shell cat ./secrets/postgres_db)"
POSTGRES_USER="$(shell cat ./secrets/postgres_user)"
POSTGRES_PASSWORD="$(shell cat ./secrets/postgres_passwd)"
SUCCESS=[ done "\xE2\x9C\x94" ]

# default arguments
user ?= root
service ?= api

all: traefik-network postgres-network postgres-volume
	@echo [ starting client '&' api... ]
	docker-compose up traefik client api db pgadmin

traefik-network:
ifeq (,$(findstring traefik-public,$(NETWORKS)))
	@echo [ creating traefik network... ]
	docker network create traefik-public
	@echo $(SUCCESS)
endif

postgres-network:
ifeq (,$(findstring postgres,$(NETWORKS)))
	@echo [ creating postgres network... ]
	docker network create postgres
	@echo $(SUCCESS)
endif

postgres-volume:
ifeq (,$(findstring postgres,$(VOLUMES)))
	@echo [ creating postgres volume... ]
	docker volume create postgres
	@echo $(SUCCESS)
endif

api: traefik-network postgres-network postgres-volume
	@echo [ starting api... ]
	docker-compose up traefik api db pgadmin

down:
	@echo [ teardown all containers... ]
	docker-compose down
	@echo $(SUCCESS)

tidy: 
	@echo [ cleaning up unused $(service) dependencies... ]
	@make exec service="api" cmd="go mod tidy"

exec:
	@echo [ executing $(cmd) in $(service) ]
	docker-compose exec -u $(user) $(service) $(cmd)
	@echo $(SUCCESS)

test-client:
	@echo [ running client tests... ]
	@make exec service="client" cmd="npm test"

test-api:
	@echo [ running api tests... ]
	@make exec service="api" cmd="go test -v ./..."

debug-api:
	@echo [ debugging api... ]
	docker-compose up traefik debug-api db pgadmin

debug-db:
	@echo [ debugging postgres database... ]
	@# basic command line interface for postgres 
	@# make exec user="$(POSTGRES_USER)" service="db" cmd="bash -c 'psql --dbname $(POSTGRES_DB)'"

	@# advanced command line interface for postgres
	@# includes auto-completion and syntax highlighting. https://www.pgcli.com/
	@docker run -it --rm --net postgres dencold/pgcli postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@db:5432/$(POSTGRES_DB)

dump:
	@echo [ dumping postgres backup for $(POSTGRES_DB)... ]
	@docker exec -it db pg_dump --username $(POSTGRES_USER) $(POSTGRES_DB) > ./api/scripts/backup.sql
	@echo $(SUCCESS)
```

## Self-signed certificates with Traefik

### Demo

```
make
```

Navigate to https://localhost:4000/products to see Traefik in action.

When viewing the api route in the browser, you will be asked to continue in Chrome it says "Your connection is not private" message. This is common when using self-signed certificates.

Simply click "Advanced", and then "Proceed to ... (unsafe)". The message you get depends on your browser.

Now do the same for the react app. Navigate to https://localhost:3000.

In a production environment, working with Traefik is not much different. You just need to ensure your DNS is setup correctly and that you have ownership of the domain names you wish to use. There's plenty of articles on how to use Traefik in production and if you run into issues you can always post your question on the [Containous community forum](https://community.containo.us/) or see if your question has already been answered. 

## Debugging Postgres In The Terminal

We already have postgres setup but we still haven't discussed how to interact with it. Eventually you're going to want to enter the running postgres container yourself to make queries or debug. There three ways we can do this.

The postgres container comes with a basic command line interface with postgres. This is your first option to start poking around. Run:

```
make debug-db
```

You should be automatically logged in. Inside the container run:

```
\dt
select name, price from products
```

This is great we now have a user friendly terminal experience with syntax highlighting and auto completion. 

## PGAdmin4: Debugging Postgres In The Browser

### Demo

Navigate to https://pgadmin.local in your browser. The the email and password is the same email and password you added to the pgadmin container service config under `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` environment variables found in the docker-compose.yml file.

## Making Postgres Database Backups

Making database backups of your postgres database is straight forward. This is a good this to explain how the your postgres database got seeded with data in the first place. Navigate to api/scripts/create-db.sh.

### Demo

```
make dump
```

# Debugging A Go API

### Demo

```
make debub-api
```

Go to /api/internal/handlers.go and place a break point in one of the handlers. Within vscode Click "Launch Remote" button in the debugger tab. Next navigate to the route that triggers the handler. You should see the editor pause where you placed the break point. 

# Running Tests

### Demo

```
make
make test-client
make test-api
```

Both commands essentially execute test commands in the running containers. While not necessary with unit tests, you should be aware of the fact that you can do this without creating additional containers specifically for tests in your docker-compose.yml file. 

Another tip is you can build a test image targeting a test stage in a multi-stage build setup within the CI tool of your choice. You won't even need to run the image after building. If the build succeeds the tests have passed. If the test image fails to build something went wrong.

```
docker build --target test --tag reload/client:test ./client
```

# Conclusion

I hope you learned a bunch about what is possible with Docker. Happy Coding.
