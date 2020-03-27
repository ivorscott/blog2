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
```
Introduction
```

The [first post](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker) introduced an initial setup, it covered _"Building A Workflow"_. If you recall, we started with a sample project and then added docker tooling using a Makefile. In the end, we adopted a workflow that used multi-stage docker builds, Postgres, and Traefik. We learned how to live reload a Go API on code changes, how to debug it with Delve and were able to run some trivial tests. I plan on writing 4 more posts in this series.

1. ~~Building A Workflow~~
2. Building A Complete API Example
3. Security and Awareness: OAuth, Observability, And Profiling
4. Docker Swarm and Traefik
5. Continuous Integration And Continuous Delivery

This post is about "Building A Complete API Example" without auth and tracing for now. There's no project starter for due to significant changes. The source code for this post can be found [here](https://github.com/ivorscott/go-delve-reload/tree/part2).

We focus on:

* Setup Improvements
* Graceful Shutdown
* Seeding & Migrations
* Package Oriented Design
* Fluent SQL Generation
* Error Handling
* Cancellation
* Request Validation
* Request Logging
* Testcontainers-go

# Setup Improvements

## 1 ) Removed Traefik from development

While Traefik will come back in production, I found it wasn't necessary in development because `create-react-app` and the `net/http` package both have mechanisms to use self signed-certificates. This cleans up our docker-compose file and speeds up our workflow since we don't need to pull the Traefik image or run the container in development.

In `create-react-app`, inside `package.json` we can enable https by adding an additional argument `HTTPS=true` behind the start command.

```json
// package.json

"scripts": {
    "start": "HTTPS=true node scripts/start.js",
    "build": "node scripts/build.js",
    "test": "node scripts/test.js"
  },
```

In Golang, we use the `crypto` package to generate a cert with `make cert`. Simply running `make` also works because `cert` is the first target in the makefile and thus the default. Generating certs more than once replaces the old certs.

```makefile
# makefile

cert:
	mkdir -p ./api/tls
	@go run $(GOROOT)/src/crypto/tls/generate_cert.go --rsa-bits=2048 --host=localhost
	@mv *.pem ./api/tls
```

We only use self-signed certificates in development, in production we will use Traefik.

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

## 2)  Cleaner terminal logging

In development, we can disable server error logging to avoid seeing "tls: unknown certificate" errors caused by self-signed certificates.

```go
// main.go

	var errorLog *log.Logger

	if !cfg.Web.Production {
		// Prevent the HTTP server from logging stuff on its own.
		// The things we care about we log ourselves from the handlers.
		// This prevents "tls: unknown certificate" errors caused by self-signed certificates
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

CompileDaemon also cluttered terminal logging.

Docker-compose prints informational messages to stderr, and container output to the same stream as it was written to in the container (stdout or stderr) [Issue #2115](https://github.com/docker/compose/issues/2115#issuecomment-193420167). So CompileDaemon was displaying an "stderr:" prefix in all container logs. This was fixed
with an additional command line flag to turn off the log prefix: `-log-prefix=false`.

```yaml
# docker-compose.yml

command: CompileDaemon --build="go build -o main ./cmd/api" -log-prefix=false --command=./main
```

## 3) Added the ArdanLabs configuration package

This package provides support for using environmental variables and command line arguments for configuration. Checkout the [configuration package](https://github.com/ardanlabs/conf).

The struct field `cfg.Web.Production` for example, can be represented as `--web-production` in cli flag form or
`API_WEB_PRODUCTION` in environment variable form. When in environment variable form there is an extra namespace to
reduce possible name conflicts in our case that namespace is `API`.

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

## 4) Removed Docker Secrets from Development

Docker Secrets will still be supported, just not in development. In development, we now use an .env file instead.
Docker secrets are a Swarm specific construct. They aren't really secret in docker-compose anyway [PR #4368](https://github.com/docker/compose/pull/4368). Docker-compose just doesn't complain when it sees them. This was necessary to ensure our application could support them in the future, when we start working with Docker Swarm in Production.

Now Docker secrets are only supported when we pass a truthy Production environment argument.

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

## 5) Removed PgAdmin4

If you're going to use pgAdmin4 you're better off using it on your host machine without a container. It's more reliable
and not a pain to configure. Importing and exporting sql files was extremely difficult when dealing with the containerized version.

## 6) Enabled Idiomatic Go development

Containerizing the go api is now optional. Dave Cheney made me do it:

https://twitter.com/davecheney/status/1232078682287591425

I think it really depends on what you're trying to achieve.

My reasons for using Docker:

1. Custom Workflows
2. Predictability Across Machines
3. Isolated Environments
4. Optional Live Reloading
5. Optional Delve Debugging
6. Integration Testing In CI
7. Preparation For Deployments

These benefits should be investigated, case by case. They deserve investment.

# Graceful Shutdown

# Seeding & Migrations

# Package Oriented Design

# Fluent SQL Generation

# Error Handling

# Cancellation

# Request Validation

# Request Logging

# Testcontainers-go

# Conclusion
