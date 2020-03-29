---
template: post
title: The Ultimate Go and React Development Setup with Docker (Part 2)
slug: ultimate-go-react-development-setup-with-docker-part2
draft: true
date: 2020-03-23T10:55:15.296Z
description: >-
  This post builds upon the previous with a focus on building a complete API
  example. There's much to cover. First I address weaknesses and improvements to
  the first post in the series. Most of this post covers backend improvements.
  The frontend switched to Typescript but won't be discussed in detail. 
category: Development
tags:
  - Docker Golang React Makefile Postgres Testing Migrations Seeding
---
# Building A Better API

# Introduction

My [first post](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker) covered _"Building A Workflow"_. We started with a sample project and containerized it. I introduced how Docker, docker-compose, and Makefiles work together to build a development routine. We incorporated multi-stage docker builds, Postgres, and Traefik, along with live reloading, debugging and testing. This post is covers _"Building A Better API"._ We begin a demo, then jump into its components and why they're important. There's no project starter this time but I provide the [demo's source code](https://github.com/ivorscott/go-delve-reload/tree/part2). 

I plan on writing 3 more posts in this series.

1. ~~Building A Workflow~~
2. ~~Building A Better API~~
3. Security and Awareness: OAuth, Observability, And Profiling
4. Docker Swarm and Traefik
5. Continuous Integration And Continuous Delivery

This post is heavily influenced by [Ardan labs service training](https://github.com/ardanlabs/service-training).

We focus on:

* [Getting Started](#getting-started)
* [Setup Changes From Part 1](#setup-changes-from-part-1)
* [Graceful Shutdown](#graceful-shutdown)
* Seeding & Migrations (With Go-Migrate)
* [Package Oriented Design](#package-oriented-design)
* Fluent SQL Generation (With Squirrel)
* [Error Handling](#error-handling)
* [Cancellation](#cancellation)
* [Request Validation](#request-validation)
* [Request Logging](#request-logging)
* Integration Testing (With TestContainers-go)

## Prerequisites

* [VSCode](https://code.visualstudio.com/)
* [Docker](https://www.docker.com/products/docker-desktop)

## Requirements

* [Setting up VSCode](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker#setting-up-vscode)

# Getting Started

Before we get into the details, let's run the demo.

Clone [the project repo](https://github.com/ivorscott/go-delve-reload) and checkout the `part2` branch.

```
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout part2
```

The project root looks like this:

```
├── /.vscode
├── /api
├── /client
├── /docs
├── .env.sample
├── .gitignore
├── README.md
├── docker-compose.yml
└── makefile
```

## The Workflow

The workflow changed significantly to support seeding and migrations. In my previous post the database was automatically populated but when more control is required that might not be suitable.

Our goal is going from an empty database to a populated one. We will make a couple migrations and seed the database before running client and api containers.

### Step 1) Copy the .env.sample file and rename it to .env.

```
# DEVELOPMENT ENVIRONMENT VARIABLES

API_PORT=4000
CLIENT_PORT=3000

POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_NET=postgres-net
```

### Step 2) Unblock port 5432 for postgres

The makefile commands and our docker-compose yaml file reference the standard 5432 port for postgres. Before continuing, close all existing postgres connections.

On a Mac with homebrew for example, if you installed `postgresql@10` execute `brew info postgresql@10` to generate information on how to start/stop the service. If you don't know what version you installed run `brew list`.

For example, on my machine I did:

```
pg_ctl -D /usr/local/var/postgresql@10 stop
killall postgresql
```

### Step 3) Create self-signed certificates

```
make cert # moves generated certs to ./api/tls/
```

### Step 4) Setup up the Postgres container

```
make db # runs database in the background
make migration create_products_table
```

Then add sql to both up & down migrations files found under: `./api/internal/schema/migrations/`.

```
-- 000001_create_products_table.up.sql

CREATE TABLE products (
    id UUID not null unique,
    name varchar(100) not null,
    price real not null,
    description varchar(100) not null,
    created timestamp without time zone default (now() at time zone 'utc')
);
```

```
-- 000001_create_products_table.down.sql

DROP TABLE IF EXISTS products;
```

Make another migration to add tags to products:

```
make migration add_tags_to_products
```

```
-- 000002_add_tags_to_products.up.sql

ALTER TABLE products
ADD COLUMN tags varchar(255);
```

```
-- 000002_add_tags_to_products.down.sql

ALTER TABLE products
DROP Column tags;
```

Migrate up to the latest migration

```
make up # you can migrate down with "make down"
```

Display which version you have selected:

```
make version
```

[Learn more about my go-migrate postgres helper](https://github.com/ivorscott/go-migrate-postgres-helper)

Next we need to seed the database:

```
make seed products
```

This adds an empty products.sql seed file found under ./api/internal/schema/seeds. Add some rows:

```
-- ./api/internal/schema/seeds/products.sql

INSERT INTO products (id, name, price, description, created) VALUES
('cbef5139-323f-48b8-b911-dc9be7d0bc07','Xbox One X', 499.00, 'Eighth-generation home video game console developed by Microsoft.','2019-01-01 00:00:01.000001+00'),
('ce93a886-3a0e-456b-b7f5-8652d2de1e8f','Playsation 4', 299.00, 'Eighth-generation home video game console developed by Sony Interactive Entertainment.','2019-01-01 00:00:01.000001+00'),
('faa25b57-7031-4b37-8a89-de013418deb0','Nintendo Switch', 299.00, 'Hybrid console that can be used as a stationary and portable device developed by Nintendo.','2019-01-01 00:00:01.000001+00')
ON CONFLICT DO NOTHING;
```

Appending "ON CONFLICT DO NOTHING;" to the end of the sql command prevents conflicts if the seed file is executed to the database more than once. Note: This behavior works because the products table has at least one table column with a unique constraint.

Finally, add the products seed file to the database

```
make insert products
```

Enter the database and examine its state

```
make debug-db
```

### Step 5) In a terminal, and under the project root, execute the commands:

```
make api # develop the api with live reloading
make client # develop the client app in a separate terminal
```

Navigate to <https://localhost:4000/v1/products> and <https://localhost:3000> in two separate tabs.

This approach to development uses containers entirely.

**Note:**

To replicate the production environment as much as possible locally, we use self-signed certificates.

In your browser, you may see a warning and need to click a link to proceed to the requested page. This is common when using self-signed certificates.

### Step 6) Idiomatic Go development (container free go api)

Another option is to only containerize the client and database. This approach allows you to work with the go api in an idiomatic fashion, with command line flags to configure the api and without live reloading on code changes.

```
export API_DB_DISABLE_TLS=true
cd api
go run ./cmd/api
# go run ./cmd/api --db-disable-tls=true
```

## Demo

Try it in Postman

**List products**
GET <https://localhost:4000/v1/products>

**Retrieve one product**
GET <https://localhost:4000/v1/products/cbef5139-323f-48b8-b911-dc9be7d0bc07>

**Create a product**
POST <https://localhost:4000/v1/products>

```
{
	"name": "Game Cube",
	"price": 74,
	"description": "The GameCube is the first Nintendo console to use optical discs as its primary storage medium.",
	"tags": null
}
```

**Update a product**
PUT <https://localhost:4000/v1/products/faa25b57-7031-4b37-8a89-de013418deb0>

{

```
"name": "Nintendo Rich!"
```

}

**Delete a product**
POST <https://localhost:4000/v1/products/faa25b57-7031-4b37-8a89-de013418deb0>

**Debugging With Delve**

If you wish to debug with Delve you can do this in a separate container instance on port 8888 automatically.

```
make debug-api
```

If required, you may refer back to the [previous tutorial on delve debugging](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker#delve-debugging-a-go-api).

# Setup Changes From Part 1

## Improvements

### Change 1) Removed Traefik from development

If you recall, the previous post used Traefik for self-signed certificates. We're no longer using Traefik in development. We'll use it strictly in production. It's not necessary because `create-react-app` and the `net/http` package both have mechanisms to use self signed-certificates. This cleans up our docker-compose file and speeds up the workflow since we don't need to pull the Traefik image or run the container.

In `create-react-app`, inside `package.json` we enable self-signed certificates by adding `HTTPS=true` behind the start command.

```json
// package.json

"scripts": {
    "start": "HTTPS=true node scripts/start.js",
    "build": "node scripts/build.js",
    "test": "node scripts/test.js"
  },
```

In Go, we use the `crypto` package to generate a cert with `make cert`. Running `make` also works because `cert` is the first target in the makefile and thus the default. This is intentional because someone could clone the repo and mistakenly think running `make` initializes the entire project (like in Part 1). This makes the Makefile usage less error-prone. Generating API certs are required anyway and generating them more than once replaces existing certs without issue.

```makefile
# makefile

cert:
	mkdir -p ./api/tls
	@go run $(GOROOT)/src/crypto/tls/generate_cert.go --rsa-bits=2048 --host=localhost
	@mv *.pem ./api/tls
```

The following code demonstrates how we can conditionally switch between self-signed certificates and Traefik usage. When `cfg.Web.Production` is true, we are using Traefik. This requires a new compose file for production purposes (discussed later in part 3, _"Docker Swarm and Traefik"_).

```go
// main.go

	// Start the service listening for requests.
	go func() {
		log.Printf("main : API listening on %s", api.Addr)
		if cfg.Web.Production {
			serverErrors <- api.ListenAndServe()
		} else {
			serverErrors <- api.ListenAndServeTLS("./tls/cert.pem", "./tls/key.pem")
		}
	}()
```

### Change 2) Cleaner terminal logging

Using self-signed certificates produces ugly logs. 

![ugly self signed cert logs](/media/ugly-self-signed-cert-logs.png "Ugly self signed certificate logs")

We can avoid the `tls: unknown certificate` message by disabling server error logging. It's ok to do this in development. The things we do care about can still be logged from logging middleware and error handling. 

When  `cfg.Web.Production` is not true, we create a new error logger that discards the server logs: `errorLog = log.New(ioutil.Discard, "", 0)`

```go
// main.go

	var errorLog *log.Logger

	if !cfg.Web.Production {
		// Prevent the HTTP server from logging stuff on its own.
		// The things we care about we log ourselves
		// Prevents "tls: unknown certificate" errors caused by self-signed certificates
		errorLog = log.New(ioutil.Discard, "", 0)
	}

	api := http.Server{
		Addr:         cfg.Web.Address,
		Handler:      c.Handler(mux),
		ReadTimeout:  cfg.Web.ReadTimeout,
		WriteTimeout: cfg.Web.WriteTimeout,
		ErrorLog:     errorLog,
	}
```

CompileDaemon created ugly logs as well. By default, CompileDaemon prefixes all child process output with `stdout` or `stderr` labels and log timestamps.

![ugly compile daemon logs](/media/ugly-compile-daemon-logs.png "Ugly compile daemon logs")

This was fixed with an additional flag to turn off the log prefix: `-log-prefix=false`.

```yaml
# docker-compose.yml

command: CompileDaemon --build="go build -o main ./cmd/api" -log-prefix=false --command=./main
```

### Change 3) Added the Ardan Labs configuration package

As stated in the intro, this post is heavily influenced by my Ardan Labs training. I highly recommend their [courses](https://education.ardanlabs.com/) and [online meetups](https://www.eventbrite.com/e/ardan-labs-live-worldwide-march-30-april-2-2020-tickets-100331129108). 

In the previous post we relied on docker secrets which is meant for production. It's also not ideal in development since we cannot opt out of a containerized api. The [Ardan Labs configuration package](https://github.com/ardanlabs/conf) provides support for using environmental variables and command line arguments for configuration. I copied and paste the package under: `/api/internal/platform/conf`.

The struct field `cfg.Web.Production` for example, can be represented as `--web-production` in cli flag form or `API_WEB_PRODUCTION` in environment variable form. In environment variable form there's an extra namespace so we only parse the vars we expect to use. This also reduces name conflicts. In our case that namespace is `API`.

```go
// main.go

	// =========================================================================
	// Configuration

	var cfg struct {
		Web struct {
			Address            string        `conf:"default:localhost:4000"`
			Production         bool          `conf:"default:false"`
			ReadTimeout        time.Duration `conf:"default:5s"`
			WriteTimeout       time.Duration `conf:"default:5s"`
			ShutdownTimeout    time.Duration `conf:"default:5s"`
			FrontendAddress    string        `conf:"default:https://localhost:3000"`
		}
		DB struct {
			User       string `conf:"default:postgres"`
			Password   string `conf:"default:postgres,noprint"`
			Host       string `conf:"default:localhost"`
			Name       string `conf:"default:postgres"`
			DisableTLS bool   `conf:"default:true"`
		}
	}

	if err := conf.Parse(os.Args[1:], "API", &cfg); err != nil {
		if err == conf.ErrHelpWanted {
			usage, err := conf.Usage("API", &cfg)
			if err != nil {
				log.Fatalf("error : generating config usage : %v", err)
			}
			fmt.Println(usage)
			return
		}
		log.Fatalf("error: parsing config: %s", err)
	}
```

As seen above, the package involves creating a nested struct and detailing the configuration vars with their associated type and a default value. After the nested struct, we use the configuration package to parse the arguments which are either cli flags or environment variables with:  `conf.Parse(os.Args[1:], "API", &cfg)`. If there's an error we either reveal usage instructions or throw a fatal error.

The next snippet shows the same vars referenced in our compose file with the `API` namespace:

```yaml
# docker-compose.yml

services:
  api:
    build:
      context: ./api
      target: dev
    container_name: api
    environment:
      CGO_ENABLED: 0
      API_DB_HOST: db
      API_WEB_PRODUCTION: "false"
      API_WEB_ADDRESS: :$API_PORT
      API_WEB_READ_TIMEOUT: 7s
      API_WEB_WRITE_TIMEOUT: 7s
      API_WEB_SHUTDOWN_TIMEOUT: 7s
      API_WEB_FRONTEND_ADDRESS: https://localhost:$CLIENT_PORT
    ports:
      - $API_PORT:$API_PORT
```

### Change 4) Removed Docker Secrets from Development

Docker Secrets are still supported, but not in development. In development, we use an .env file. When a docker-compose file is neighboring an .env file in the same directory we can reference the environment variables with a dollar sign prefixed before the name, for example: `$API_PORT` or `$CLIENT_PORT`. 


Docker secrets are a Swarm specific construct. They aren't really secret in docker-compose anyway [PR #4368](https://github.com/docker/compose/pull/4368). This only works because docker-compose isn't complaining when it sees them. Our secrets setup will come in handy in production (also discussed later in part 3, _"Docker Swarm and Traefik"_).

Now Docker secrets are only supported when `cfg.Web.Production` is true. When this happens we swap out the default database configuration with secrets.

```go
// main.go

	// =========================================================================
	// Enabled Docker Secrets

	if cfg.Web.Production {
		dockerSecrets, err := secrets.NewDockerSecrets()
		if err != nil {
			log.Fatalf("error : retrieving docker secrets failed : %v", err)
		}

		cfg.DB.Name = dockerSecrets.Get("postgres_db")
		cfg.DB.User = dockerSecrets.Get("postgres_user")
		cfg.DB.Host = dockerSecrets.Get("postgres_host")
		cfg.DB.Password = dockerSecrets.Get("postgres_passwd")
	}
```

### Change 5) Removed PgAdmin4

PgAdmin4 is just one of many Postgres editors available. For example, I've enjoyed using SQLPro Studio at work. If you're going to use PgAdmin4 or any other editor you're better off using it on your host machine outside a container. Reason being, it's more reliable. I found importing and exporting sql files extremely difficult in the PgAdmin4 UI within a container.

### Change 6) Enabled Idiomatic Go development

Containerizing the go api is now optional (as it should be). This makes our development workflow even more flexible. The change was inspired by this tweet:

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Folks, keep docker out of your edit/compile/test inner loop.</p>&mdash; Dave Cheney (@davecheney) <a href="https://twitter.com/davecheney/status/1232078682287591425?ref_src=twsrc%5Etfw">February 24, 2020</a></blockquote>

I think it depends on what you're trying to achieve and your comfort with Docker.

My reasons for using Docker:

1. Custom Workflows
2. Predictability Across Machines
3. Isolated Environments
4. Optional Live Reloading
5. Optional Delve Debugging
6. Integration Testing In CI
7. Preparation For Deployments

# Graceful Shutdown

What\
Why\
How

# Seeding & Migrations

What\
Why\
How

# Package Oriented Design

What\
Why\
How

# Fluent SQL Generation

What\
Why\
How

# Error Handling

What\
Why\
How

# Cancellation

What\
Why\
How

# Request Validation

What\
Why\
How

# Request Logging

What\
Why\
How

# Testcontainers-go

What\
Why\
How

# Conclusion
