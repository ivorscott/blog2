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

`docker-compose` is a command line tool and configuration file. It was never designed for production. You should use it for local development and test automation. For production, you are better off using a production grade orchestrator like Docker Swarm -- [here's why](https://github.com/BretFisher/ama/issues/8).

With `docker-compose` we can run a collection of containers with one command. It makes running multiple containers far easier especially when containers have relationships and depend on one another.

In the project root, create a `docker-compose.yml` file and open it.

```
touch docker-compose.yml        
```

Add the following:

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

networks:
  postgres:
  traefik-public:

secrets:
  postgres_db:
    file: ./secrets/postgres_db
  postgres_passwd:
    file: ./secrets/postgres_passwd
  postgres_user:
    file: ./secrets/postgres_user
```

Create a `secrets` folder in the project root. Add the following secret files.

```
└── secrets
   ├── postgres_db
   ├── postgres_passwd
   └── postgres_user
```

In each file add some secret value.

Navigate to your host machine's  `/etc/hosts` file and open it. 

```
sudo vim /etc/hosts
```

Add the following domains.

```
127.0.0.1       client.local api.local debug.api.local traefik.api.local pgadmin.local
```



### Demo

```
docker-compose up
```

In two separate browser tabs, navigate to <https://api.local/products> first and then <https://client.local>

> **Note:**
>
> In your browser, you may see warnings prompting you to click a link to continue to the requested page. This is quite common when using self-signed certificates and shouldn't be a reason of concern.
>
> The reason we are using self-signed certificates in the first place is to replicate the production environment as much as possible.

You should see the products being shown in the react app, meaning the `traefik`, `api`, `client`, and `db` containers are communicating successfully.

```
docker-compose down --volumes
```

You might have noticed that when `docker-compose up` created our volume and networks their names were prefixed with the `go-delve-reload` project directory name:

![](/media/screen-shot-2020-01-09-at-14.01.13.png)

![](/media/screen-shot-2020-01-09-at-14.01.46.png)

In the next section, we'll use a makefile to create our postgres volume and required networks. Update the `docker-compose.yml` file to tell docker-compose that we expect the postgres volume and required networks to be created externally. Add the following.

```
volumes:
  postgres:
    external: true

networks:
  postgres:
    external: true
  traefik-public:
    external: true
```



# Makefiles

It can be a hassle to type various docker commands. [GNU Make](https://www.gnu.org/software/make/) is a build automation tool that automatically builds executable programs from source code by reading files called Makefiles.

Here's an example makefile:

```
#!make 
hello: hello.c
  gcc hello.c -o hello
```

The main feature we care about is:

> \[ The ability ] to build and install your package without knowing the details of how that is done -- because these details are recorded in the makefile that you supply. 
>
> \-- https://www.gnu.org/software/make/

\
The syntax is:

```
target: prerequisite prerequisite prerequisite ...
(TAB) commands 
```

> **Note:**
>
>  targets and prerequisites don't have to be files. 

In the command line, we would run this example makefile by typing `make` or `make hello`. Both would work because when a target is not specified the first target in the makefile is executed. 



## Creating The Makefile

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
	docker-compose up --build traefik client api db pgadmin

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
	@# advanced command line interface for postgres
	@# includes auto-completion and syntax highlighting. https://www.pgcli.com/
	@docker run -it --rm --net postgres dencold/pgcli postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@db:5432/$(POSTGRES_DB)

dump:
	@echo [ dumping postgres backup for $(POSTGRES_DB)... ]
	@docker exec -it db pg_dump --username $(POSTGRES_USER) $(POSTGRES_DB) > ./api/scripts/backup.sql
	@echo $(SUCCESS)

.PHONY: all
.PHONY: traefik-network
.PHONY: postgres-network
.PHONY: postgres-volume
.PHONY: api
.PHONY: down
.PHONY: tidy
.PHONY: exec
.PHONY: test-client
.PHONY: test-api
.PHONY: debug-api
.PHONY: debug-db
.PHONY: dump
```



### Demo

```
make
```

When you execute a target, each command in the target's command body will be printed to stdout in a self documenting way and then executed. If you don't want a command printed to stdout but you want it executed, you can add the "@" symbol before it. Makefile comments are preceded by a "#" symbol. Using "@#" before a command will hide it from stdout and never execute.

I added documentation to every target using `echo` to describe what each one does. 



## Variables

Variables can be defined at the top of a Makefile and referenced later. 

```
#!make
NETWORKS="$(shell docker network ls)"
```

Using the syntax `$(shell <command>)` is one way to execute a command and store its value in a variable.

Environment variables from a .env file can be referenced as long as you include it at the top of the makefile.

```
#!make
include .env

target:     
    echo ${MY_ENV_VAR} 
```



## Phony Targets

A makefile can't distinguish between a file target and a phony target.

> A phony target is one that is not really the name of a file; rather it is just a name for a recipe to be executed when you make an explicit request. There are two reasons to use a phony target: to avoid a conflict with a file of the same name, and to improve performance.
>
> \-- https://www.gnu.org/software/make/manual/html_node/Phony-Targets.html

 Each of our commands are `.PHONY:` targets because they don't represent files.

### 

## Debugging Postgres In The Terminal

We still haven't discussed how to interact with it Postgres. Eventually you're going to want to enter the running Postgres container to make queries or debug.



### Demo

```
make debug-db
```

You should be automatically logged in. Run a couple commands to get a feel for it.

```
\dt
```

Then:

```
select name, price from products
```

The `debug-db` target uses an advanced command line interface for Postgres called [pgcli](https://www.pgcli.com/).

This is great we now have a user friendly terminal experience with syntax highlighting and auto completion. 



## PGAdmin4: Debugging Postgres In The Browser

Not everyone likes the terminal experience when working with Postgres. We also have a browser option using [pgAdmin4](https://www.pgadmin.org/download/pgadmin-4-container/). 

To login, the email is `test@example.com` and the password is `SuperSecret.` To change these values you will need to update the `docker-compose.yml` file. Simply update the hardcoded environment variables `PGADMIN_DEFAULT_EMAIL` and `PGADMIN_DEFAULT_PASSWORD` to whatever you want.



### Demo

Navigate to [https://pgadmin.local ](https://pgadmin.local)in your browser. Login.

![](/media/screen-shot-2020-01-09-at-20.58.30.png)

![](/media/screen-shot-2020-01-09-at-20.59.11.png)

![](/media/screen-shot-2020-01-09-at-21.00.08.png)

![](/media/screen-shot-2020-01-09-at-21.03.59.png)

![](/media/screen-shot-2020-01-09-at-21.04.07.png)



## Making Postgres Database Backups

Making database backups of your Postgres database is straight forward. 



### Demo

```
make dump
```

You're probably wondering how the Postgres database got seeded with data in the first place.

The official Postgres image states: 

> If you would like to do additional initialization in an image derived from this one, add one or more \*.sql, \*.sql.gz, or \*.sh scripts under /docker-entrypoint-initdb.d (creating the directory if necessary). After the entrypoint calls initdb to create the default postgres user and database, it will run any \*.sql files, run any executable \*.sh scripts, and source any non-executable \*.sh scripts found in that directory to do further initialization before starting the service.
>
> \-- https://hub.docker.com/_/postgres

So I put a database creation script in the api located under `api/scripts/create-db.sh`.

```
#!/bin/bash
set -e

if [ ! -f "/docker-entrypoint-initdb.d/backup.sql" ]; then

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -- <<-EOSQL
    CREATE TABLE products (
        id serial primary key,
	    name varchar(100) not null,
	    price real not null,
	    description varchar(100) not null,
	    created timestamp without time zone default (now() at time zone 'utc')
    );
    INSERT INTO products (name, price, description)
    VALUES
        ('Xbox One X', 499.00, 'Eighth-generation home video game console developed by Microsoft.'),
        ('Playsation 4', 299.00, 'Eighth-generation home video game console developed by Sony Interactive Entertainment.'),
        ('Nintendo Switch', 299.00, 'Hybrid console that can be used as a stationary and portable device developed by Nintendo.');
    SELECT name, price from products;
EOSQL
fi
```

In the `docker-compose.yml` file, the `create-db.sh` script is bind mounted into the container at the expected path. 

```
    volumes:
      - postgres:/var/lib/postgresql/data
      - ./api/scripts/:/docker-entrypoint-initdb.d/
```

The script only runs if a backup doesn't exist. That way, when you make a dump of the backup, (which is automatically placed in the `api/scripts` directory), if we were to remove the database volume and start over, the next time around, the `create-db.sh` would not run and only the backup would be picked up.



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
docker build --target test --tag demo/client:test ./client
```



# Conclusion

I hope you learned a bunch about what is possible with Docker. Happy Coding.
