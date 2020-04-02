---
template: post
title: The Ultimate Go and React Development Setup with Docker (Part 2)
slug: ultimate-go-react-development-setup-with-docker-part2
draft: true
date: 2020-03-23T10:55:15.296Z
description: >-
  The first post is this series covered "Building A Workflow". Which introduced
  how Docker and Makefiles could collaborate to make a development workflow.
  This post covers “Building A Better API”.  First we discuss some improvements
  to part 1. Then walk through a demonstration. Ending with a quick overview of
  the API improvements seen in the demo. The API supports: graceful shutdown,
  seeding and migrations, package oriented design, SQL generation. As well as
  error handling, cancellation, request validation, request logging, and
  integration testing.
category: Development
tags:
  - Docker Golang React Makefile Postgres Testing Migrations Seeding
---
# Building A Better API

# Introduction

The [first post](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker) is this series covered "Building A Workflow". Which introduced how Docker and Makefiles could collaborate to make a development workflow. This post covers “Building A Better API”.  First we discuss some improvements to part 1. Then walk through a demonstration. Ending with a quick overview of the API improvements in the demo. Many improvements originate from [Ardan labs service training](https://github.com/ardanlabs/service-training).

I plan on writing 3 more posts in this series.

1. ~~Building A Workflow~~
2. ~~Building A Better API~~
3. Security and Awareness: OAuth, Observability, And Profiling
4. Docker Swarm and Traefik
5. Continuous Integration And Continuous Delivery

We focus on:

* [Getting Started](#getting-started)
* [Improvements to Part 1](#improvements-to-part-1)
* [The Demo](#the-demo)
* [Graceful Shutdown](#graceful-shutdown)
* [Seeding & Migrations (With Go-Migrate)](#seeding--migrations)
* [Package Oriented Design](#package-oriented-design)
* [Fluent SQL Generation (With Squirrel)](#fluent-sql-generation)
* [Error Handling](#error-handling)
* [Cancellation](#cancellation)
* [Request Validation](#request-validation)
* [Request Logging](#request-logging)
* [Integration Testing (With TestContainers-go)](#integration-testing)

## Requirements

* [VSCode](https://code.visualstudio.com/)
* [Docker](https://www.docker.com/products/docker-desktop)

# Getting Started

Clone [the project repo](https://github.com/ivorscott/go-delve-reload) and checkout the `part2` branch.

```
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout part2
```

The project root looks like this:

```
├── .vscode
├── api
├── client
├── docs
├── .env.sample
├── .gitignore
├── README.md
├── docker-compose.yml
└── makefile
```

Review [Setting up VSCode](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker#setting-up-vscode) before continuing.

# Improvements to Part 1

## 1) Removed Traefik from development

If you recall, the previous post used Traefik for self-signed certificates. We're no longer using Traefik in development. We'll use it in production. `create-react-app` and the `net/http` package both have mechanisms to use self signed-certificates. This cleans up our docker-compose file and speeds up the workflow. Now we don't need to pull the Traefik image or run the container.

In the client app we enable self-signed certificates by adding `HTTPS=true` to the `package.json`.

```json
// package.json

"scripts": {
    "start": "HTTPS=true node scripts/start.js",
    "build": "node scripts/build.js",
    "test": "node scripts/test.js"
  },
```

In Go, we use the `crypto` package to generate a cert with `make cert`. Running make also works because cert is the first target in the makefile and thus the default. This is intentional. Someone might think executing make initializes the project (like in Part 1). In that case, they end up generating required API certs instead.  This makes the Makefile usage less error-prone. Generating certs more than once replaces existing certs without issue.

```makefile
# makefile

cert:
	mkdir -p ./api/tls
	@go run $(GOROOT)/src/crypto/tls/generate_cert.go --rsa-bits=2048 --host=localhost
	@mv *.pem ./api/tls
```

The following demonstrates how we can switch between self-signed certificates and Traefik. When `cfg.Web.Production` is true, we are using Traefik. In part 3 (_"Docker Swarm and Traefik"_), we will have a separate compose file for production.

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

## 2) Cleaner terminal logging

Using self-signed certificates produces ugly logs.

![ugly self signed cert logs](/media/ugly-self-signed-cert-logs.png "Ugly self signed certificate logs")

We can avoid the `tls: unknown certificate` message by disabling server error logging. It's ok to do this in development. The things we do care about print from logging and error middleware.

When `cfg.Web.Production` is false, a new error logger will discard server logs.

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

[CompileDaemon](https://github.com/githubnemo/CompileDaemon) created ugly logs as well. CompileDaemon prefixes all child process output with `stdout` or `stderr` labels.

![ugly compile daemon logs](/media/ugly-compile-daemon-logs.png "Ugly compile daemon logs")

Resolve this with a new flag that turns off the log prefix: `-log-prefix=false`.

```yaml
# docker-compose.yml

command: CompileDaemon --build="go build -o main ./cmd/api" -log-prefix=false --command=./main
```

## 3) Added the Ardan Labs configuration package

In part 1, API configuration came from environment variables in the docker-compose file. But the were dependent on docker secret values, making it harder to opt out of docker in development. Reserve docker secrets for production and adopt the [Ardan Labs configuration package](https://github.com/ardanlabs/conf). The package supports both environment variables and command line arguments. Now we can out out of docker if we want a more idiomatic Go API development workflow. I copied and paste the package under: `/api/internal/platform/conf`.

The struct field cfg.Web.Production can in cli form would be `--web-production`. In environment variable form it is  `API_WEB_PRODUCTION`. Notice, as an environment variable there's an extra namespace. This ensures we only parse the vars we expect. This also reduces name conflicts. In our case that namespace is `API`.

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

The configuration package requires a nested struct describing the configuration fields. Each field has a type and default value supplied in a struct tag. To parse the arguments, as environment variables or the command line flags we do: `conf.Parse(os.Args[1:], "API", &cfg)`. If there's an error we either reveal usage instructions or throw a fatal error.

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

Store default environment variables in a `.env` file. When an `.env` file exists in the same directory as the docker-compose file, we can reference it. To do this, prefix a dollar sign before the environment variable name. For example:  `$API_PORT` or `$CLIENT_PORT`. This allows us to maintain default values in a separate file for docker-compose.

## 4) Removed Docker Secrets from Development

Docker secrets are a Swarm specific construct. They aren't secret in docker-compose anyway [PR #4368](https://github.com/docker/compose/pull/4368). This only works because docker-compose isn't complaining when it sees them. Now Docker secrets are only supported when `cfg.Web.Production` is true. When this happens we swap out the default database configuration with secrets.

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

More on Docker secrets when we get to production (discussed in part 3, _"Docker Swarm and Traefik"_).

## 5) Removed PgAdmin4

PgAdmin4 is one of many Postgres editors available. For example, I've enjoyed using SQLPro Studio at work. If you're going to use PgAdmin4 or any other editor, use it on your host machine without a container. Reason being, it's more reliable. Importing and exporting sql files is difficult in a PgAdmin4 container.

## 6) Enabled Idiomatic Go development

Containerizing the Go API is now optional. This makes our development workflow even more flexible. This tweet made me consider the consequences of having the API too coupled to Docker.

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Folks, keep docker out of your edit/compile/test inner loop.</p>&mdash; Dave Cheney (@davecheney) <a href="https://twitter.com/davecheney/status/1232078682287591425?ref_src=twsrc%5Etfw">February 24, 2020</a></blockquote>

In the end Docker should be optional and you should know your reasons for using it. My reasons are:

1. Custom Workflows
2. Predictability Across Machines
3. Isolated Environments
4. Optional Live Reloading
5. Optional Delve Debugging
6. Integration Testing In CI
7. Preparation For Deployments

# The Demo

The workflow changed to support seeding and migrations. In Part 1, the database was setup for us, but it's more powerful to populate it ourselves

Our goal is going from an empty database to a seeded one. First, we will create a database container in the background. Then make a couple migrations, and seed the database before running more containers.

## Step 1) Rename .env.sample to .env

The contents of `.env` should look like this:

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

That's it. No further modifications required.

## Step 2) Unblock port 5432 for Postgres

Both the Makefile and docker-compose file reference the standard Postgres port: 5432. Before continuing, close any existing Postgres connections.

For example, I have a pre-existing installation of Postgres installed with Homebrew.  Executing `brew info postgresql@10` generates info on how to start/stop the service. If I didn't know what version I installed I would run `brew list`.

With Homebrew I do:

```
pg_ctl -D /usr/local/var/postgresql@10 stop
killall postgresql
```

## Step 3) Create self-signed certificates

The next command moves generated certificates to the `./api/tls/` directory.

```
make cert
```

## Step 4) Setup up the Postgres container

Run the database in the background.

```
make db
```

#### Create your first migration

Make a migration to create the products table. 

```
make migration create_products_table
```

Add sql to both `up` & `down` migrations files found at: `./api/internal/schema/migrations/`. 

**Up**

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

**Down**

```
-- 000001_create_products_table.down.sql

DROP TABLE IF EXISTS products;
```

#### Create your second migration

Make another migration to add tags to products.

```
make migration add_tags_to_products
```

**Up**

```
-- 000002_add_tags_to_products.up.sql

ALTER TABLE products
ADD COLUMN tags varchar(255);
```

**Down**

```
-- 000002_add_tags_to_products.down.sql

ALTER TABLE products
DROP Column tags;
```

Migrate up to the latest migration

```
make up
```

Display which version you have selected. Expect it two print `2` since you created 2 migrations.

```
make version
```

[Learn more from my go-migrate Postgres tutorial repo](https://github.com/ivorscott/go-migrate-postgres-helper)

#### Seeding the database

Create a seed file of the appropriate name matching the table name you wish to seed.

```
make seed products
```

This adds an empty products.sql seed file found under `./api/internal/schema/seeds`. Add the following sql content:

```
-- ./api/internal/schema/seeds/products.sql

INSERT INTO products (id, name, price, description, created) VALUES
('cbef5139-323f-48b8-b911-dc9be7d0bc07','Xbox One X', 499.00, 'Eighth-generation home video game console developed by Microsoft.','2019-01-01 00:00:01.000001+00'),
('ce93a886-3a0e-456b-b7f5-8652d2de1e8f','Playsation 4', 299.00, 'Eighth-generation home video game console developed by Sony Interactive Entertainment.','2019-01-01 00:00:01.000001+00'),
('faa25b57-7031-4b37-8a89-de013418deb0','Nintendo Switch', 299.00, 'Hybrid console that can be used as a stationary and portable device developed by Nintendo.','2019-01-01 00:00:01.000001+00')
ON CONFLICT DO NOTHING;
```

Conflicts may arise when you execute the seed file more than once to the database. Appending "ON CONFLICT DO NOTHING;" to the end prevents this. This functionality depends on at least one table column having a unique constraint. In our case id is unique.

Finally, add the products seed to the database.

```
make insert products
```

Enter the database and examine its state if you'd like.

```
make debug-db
```

If the database gets deleted, you don't need to repeat every instruction. Simply run:

```
make db
make up
make insert products
```

## Step 5) Run the api and client containers

#### Run Go API container with live reload enabled

```
make api
```

#### Run the React TypeScript app container

```
make client
```

First, navigate to the API in the browser at: <https://localhost:4000/v1/products>.

Then to the client app at: <https://localhost:3000> in a separate tab.

This approach to development uses containers entirely.

**Note:**

To replicate the production environment as much as possible locally, we use self-signed certificates.

In your browser, you may see a warning and need to click a link to proceed to the requested page. This is common when using self-signed certificates.

### Optional Step 6) Idiomatic Go development

Another approach is to containerize only the client and database. Work with the API in an idiomatic fashion. This means without a container and with live reloading disabled. To configure the API, use command line flags or export environment variables.

```
export API_DB_DISABLE_TLS=true
cd api
go run ./cmd/api
# go run ./cmd/api --db-disable-tls=true
```

## Try it in Postman

**List products**

GET <https://localhost:4000/v1/products>

**Retrieve one product**

GET <https://localhost:4000/v1/products/:id>

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

PUT <https://localhost:4000/v1/products/:id>

```
{
	"name": "Nintendo Rich!"
}
```

**Delete a product**

DELETE <https://localhost:4000/v1/products/:id>

# Graceful Shutdown

Description

Importance

How it works

# Seeding & Migrations

Description

Importance

How it works

# Package Oriented Design

Description

Importance

How it works

# Fluent SQL Generation

Description

Importance

How it works

# Error Handling

Description

Importance

How it works

# Cancellation

Description

Importance

How it works

# Request Validation

Description

Importance

How it works

# Request Logging

Description

Importance

How it works

# Integration Testing

Description

Importance

How it works

# Conclusion
