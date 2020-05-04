---
template: post
title: The Ultimate Go and React Development Setup with Docker (Part 2)
slug: ultimate-go-react-development-setup-with-docker-part2
draft: false
date: 2020-03-23T10:55:15.296Z
description: >-
  When building APIs in Go, there are critical decisions you need to make up front. You might be shocked to learn that there isn't really a defacto standard when it comes to a server router. In Node you have express, in Go, well you have gin, chi, echo, gorrilla/mux or the built-in net/http library. I found this incredibly challenging starting out. If you're like me, your busy and want to hit the ground running leveraging a full-featured example you actually understand. Something production ready you can extend for your needs. This post covers “Building An API".
category: Development
tags:
  - Docker Golang React Makefile Postgres Testing Migrations Seeding
socialImage: "/media/part2.jpeg"
---

![](/media/part2.jpeg)

# Introduction

[Part 1](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker) of this series covered "Building A Workflow", where I demonstrated how to streamline a development workflow using Docker, docker-compose and Makefiles. This post covers “Building An API”. I'll share the challenges I faced building a production ready API. Then we'll get to see some code and I'll walk through the API implementation so you can understand enough to build your own. After that, we'll see a demo and discover how our workflow has changed. Feel free to [skip straight to the demo](#demo) if you want.

We focus on:

- [Challenges](#challenges)
- [The API](#the-api)
- [Package Oriented Design](#package-oriented-design)
- [Configuration](#configuration)
- [Docker Secrets](#configuration)
- [Profiling](#profiling)
- [Graceful Shutdown](#graceful-shutdown)
- [Error Handling](#error-handling)
- [Handling Requests](#requests)
- [Middleware](#middleware)
- [Seeding & Migrations](#seeding--migrations)
- [Integration Testing](#integration-testing)
- [A Demo](#demo)

## Requirements

- [VSCode](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/products/docker-desktop)

# Challenges

Migrating from Node to Go is challenging. Beyond language syntax and mechanics, I faced 4 big challenges when it came to production ready services.

1. <div title="general" style="display:inline;background-color: #FFFB78">You need to rethink the way you structure your application.</div> For example, you can't have circular dependencies in Go, the application won't compile if you do.

2. <div title="general" style="display:inline;background-color: #FFFB78">You need to relearn concepts and discover how they're implemented in Go.</div> Concepts like, routing, CRUD, interacting with a database, graceful shutdown, seeding and migrations, integration testing etc.

3. <div title="general" style="display:inline;background-color: #FFFB78">You need to choose between using built-in standard libraries or adopting full-featured tried-and-true packages from 3rd-parties.</div> There are benefits and disadvantages to each.

4. <div title="general" style="display:inline;background-color: #FFFB78">You need to choose between using a database ORM abstraction layer or going bare metal with SQL.</div> An ORM might get you to your destination faster but there are trade-offs to consider.

If you've developed in other languages and serious about Go, you just want a production ready example up front you can test drive. This doesn't necessarily mean you want an easy ride. You just want a guide. Some starter code you can read, tinker with and determine if you like it or not. If it peaks your interest, you extend it.

I followed many incomplete API tutorials or web app examples that left me frustrated and eager to just find a complete guide to building APIs in Go. Ardan Labs solved my problem. They provide professional training for Go. In fact, the demo API in this post is an extension of their [service example](https://github.com/ardanlabs/service). I simply extended it, adding cors, go-migrate, testcontainers-go, a fluent SQL generator, self-signed certificates, and docker secrets.

I first heard about Ardan Labs last year and attended a workshop.

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">First day of training has been intense! <a href="https://twitter.com/hashtag/golang?src=hash&amp;ref_src=twsrc%5Etfw">#golang</a> <a href="https://twitter.com/hashtag/ultimategotraining?src=hash&amp;ref_src=twsrc%5Etfw">#ultimategotraining</a> <a href="https://t.co/wdEQ5MrxK0">pic.twitter.com/wdEQ5MrxK0</a></p>&mdash; ivorscott (@ivorsco77) <a href="https://twitter.com/ivorsco77/status/1182291425830019074?ref_src=twsrc%5Etfw">October 10, 2019</a></blockquote>

The training opened the door to a lot of ideas and more importantly it accelerated my path to success. If you want to learn fast and have a budget, I highly recommend their [workshops](https://www.eventbrite.com/o/ardan-labs-7092394651?utm_source=ardan_website&utm_medium=scrolling_banner&utm_campaign=website_livestream_promo) or [courses](https://education.ardanlabs.com/).

# The API

I'm going to talk about the API features I find interesting. If you're new to this kind of stuff (like I was a couple months ago), I hope you'll learn something and feel confident in navigating the [source code](https://github.com/ivorscott/go-delve-reload/tree/part2) on your own. I hope to learn too in sharing my understanding.

![architecture](/media/arch.png)

## Package Oriented Design

<div><div title="definition" style="display:inline;background-color: #D2F774">Package Oriented Design is a design strategy and project structure Ardan Labs uses to enforce good design guidelines meant to keep projects organized and sustainable as they grow.</div> The strategy derives from 3 goals: <i>purpose, usability and portability</i>.</div>

Package Oriented Design suggests _Application Projects_ should have a `/cmd` and `/internal` folder at the root of the project. The cmd folder houses the main applications for the project if there are more than one, for example, an api, cli etc., and the internal folder contains any code that should be kept internal to the project. The internal folder is necessary because breaking changes may occur when a project's public API surface changes. This idea is described by _Hyrum's law:_

<blockquote title="evidence"><div style="display:inline;background-color: #FFDE70">"With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody."</div>

-- Winters, Titus. Software Engineering at Google. Lessons Learned from Programming Over Time. O'REILLY, 2020. </blockquote>

When you use the term _internal_ as a folder name you receive compiler protection in Go. This is a very cool idea. Any package that exists under internal will be restricted so that they can only be imported by other packages that are apart of the same root folder.

![architecture](/media/internal-folder.png)

In Package Oriented Design, the internal packages are split into two types: _business_ and _platform specific_ logic. A _platform_ folder contains the core packages of the project that are unrelated to the business domain. For example, the platform folder in the demo contains 3 foundational packages: _the database, configuration and web packages._

![architecture](/media/internal-platform.png)

Everything else in the internal folder supports the business domain. That's all you need to know for now. To learn more about package oriented design, here's a couple articles about [the strategy](https://www.ardanlabs.com/blog/2017/02/package-oriented-design.html) and [the philosophy behind it](https://www.ardanlabs.com/blog/2017/02/design-philosophy-on-packaging.html). In addition, to the cmd and internal folder, I have added a tls folder to hold certificates and a pkg folder to hold reusable code that might be used in other projects. Some of these project layout ideas are also preserved in a repository called [Standard Go Project Layout](https://github.com/golang-standards/project-layout).

## Configuration

In Part 1, API configuration came from environment variables in the docker-compose file. But it was dependent on docker secret values, making it harder to opt-out of docker in development. Furthermore, we didn't support any configuration tool for variables that weren't secret. I chose to reserve docker secrets for production and adopt the [Ardan Labs configuration package](https://github.com/ardanlabs/conf). The package supports both environment variables and command line arguments. Now we can opt-out of docker if we want a more idiomatic Go API development workflow. In doing this, we keep the integrity of our service. I copied and pasted the package directly under: `./api/internal/platform/conf`.

The package takes struct fields and translates them to cli flags and environment variables. The struct field `cfg.Web.Production` in cli form would be `--web-production`. But in environment variable form it is `API_WEB_PRODUCTION`. Notice as an environment variable there's an extra namespace. This ensures we only parse the vars we expect. This also reduces name conflicts. In our case that namespace is `API`.

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
    User       string `conf:"default:postgres,noprint"`
    Password   string `conf:"default:postgres,noprint"`
    Host       string `conf:"default:localhost,noprint"`
    Name       string `conf:"default:postgres,noprint"`
    DisableTLS bool   `conf:"default:true"`
  }
}

```

The configuration package requires a nested struct describing the configuration fields. Each field has a type and default value supplied in a struct tag. The _noprint_ value in the struct tag can be used to omit secret data from logging. Next we parse the arguments, as environment variables or command line flags:

```go
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

If there's an error we either reveal usage instructions or throw a fatal error. The next snippet shows the same configuration fields in our docker-compose file with the API namespace:

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

When necessary we may abstract some environment variables into a centralized location and pull them in. When an `.env` file exists in the same directory as the docker-compose file, we can reference its vars. To do this, prefix a dollar sign before the environment variable name. For example: `$API_PORT` or `$CLIENT_PORT`. This allows for better maintenance of configuration defaults, especially when values are referenced in multiple places.

## Docker Secrets

<div><div style="display:inline;background-color: #D2F774">A docker secret is data that shouldn't be sent over a network or stored unencrypted in a Dockerfile or in your app's code.</div> Something like a password, private key, or TLS certificate. They are only available in Docker 13 and higher. We use Docker secrets to centralize secret management and securely pass them strictly to the containers that need access. They are encrypted during transit and at rest.</div>

<a href="https://docs.docker.com/engine/swarm/secrets/" target="_blank" onMouseOver="this.style.color='#F7A046'" 
onMouseOut="this.style.color='#5D93FF'" style="color:#5D93FF">Docker secrets</a> are a Swarm specific construct. That means they aren't secret outside of Swarm. They only work in docker-compose file because docker-compose doesn't complain when it sees them [PR #4368](https://github.com/docker/compose/pull/4368). The Go API only supports Docker secrets when `cfg.Web.Production` is true. So it's already set up for Swarm usage. When this happens we swap out the default database configuration with secrets.

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

To handle secrets I'm using a slightly modified version of a [secrets package](https://github.com/ijustfool/docker-secrets) I found on the internet. It's located under: `/api/pkg/secrets/secrets.go`

The `NewDockerSecrets` method reads All the secrets located in the secrets directory. By default that's /run/secrets. Then it creates a mapping that can be accessed by the `Get` method. More on Docker secrets when we get to production (discussed in Part 3, _"Docker Swarm and Traefik"_).

## Profiling

<div>
To measure how our programs are performing we use profiling. <i>The Go Programming langauge</i> by Alan A. A. Donovan and Brian W. Kernighan writes, <div style="display:inline;background-color: #D2F774">"Profiling is an automated approach to performance measurement based on sampling a number of profile events during the execution, then extrapolating from them during a post-processing step; the resulting statistical summary is called a profile".</div> Amazingly, Go supports many kinds of profiling. The standard library supports profiling with a package named <a href="https://golang.org/pkg/net/http/pprof/" target="_blank">pprof</a>. Here's a few predefined profiles pprof provides:</div>

- block: stack traces that led to blocking on synchronization primitives
- goroutine: stack traces of all goroutines
- heap: sampling traces of all current goroutines
- mutex: stack traces of holders of contended mutexes
- profile: CPU profile

Using pprof to measure an API, involves importing the standard HTTP interface to profiling data.

```go
import _ "net/http/pprof"
```

Since we don't use the import directly and just wish to use its side effects we place and \_ in front of the import. The import will register handlers under /debug/pprof/ using the DefaultServeMux. If you are not using the DefaultServeMux you need to register the handlers with the mux your are using. It's worth noting, that these handlers should not be accessible to the public because of this we use the DefaultServerMux on a dedicated port in a separate goroutine to leverage pprof.

```go
// =========================================================================
// Enabled Profiler

go func() {
  log.Printf("main: Debug service listening on %s", cfg.Web.Debug)
  err := http.ListenAndServe(cfg.Web.Debug, nil)
  if err != nil {
    log.Printf("main: Debug service listening on %s", cfg.Web.Debug)
  }
}()
```

In production, we won't expose the registered handlers pprof provides to Traefik. If we navigate to http://localhost:6060/debug/pprof/ we'll see something like this:

![](/media/pprof.png)

Some additional utilities you may want to install are an HTTP load generator like [hey](https://github.com/rakyll/hey). And [graphviz](http://graphviz.gitlab.io/download/) if you want to visualize a profile in a web page.

```bash
brew install hey graphviz
```

Then in one terminal you can make 10 concurrent connections to make 2000 requests to the api

```bash
hey -c 10 -n 2000 https://localhost:4000/v1/products
```

While in another terminal, we leverage one of the register handlers setup by pprof. In the case, we want to capture a cpu profile for a duration of 10 seconds to measure the server activity.

```bash
go tool pprof http://localhost:6060/debug/pprof/profile\?seconds\=10
```

Afterward we can run top or top -cum to analyze the profile captured.

![](/media/profile.png)

Or view a visualization in a webpage.

![](/media/web.png)

## Graceful Shutdown

With production services you shouldn't immediately shutdown when an error occurs. You want to shutdown gracefully to give any requests a chance to finish.

![](/media/graceful-shutdown.png)

First thing to do is handle potential server errors separately from interrupt and termination signals perhaps caused by the operating system or even Docker Engine (when we deploy). When a server error occurs it will do so immediately and in these cases we don't want to gracefully shutdown. If the server can't start then we should shutdown immediately. We capture server errors when the api listens and serves.

```go

func main() error {
// ...

// =========================================================================
// Start API Service

// Make a channel to listen for shutdown signal from the OS.
shutdown := make(chan os.Signal, 1)

api := http.Server{
  Addr:         cfg.Web.Address,
  Handler:      handlers.API(shutdown, repo, infolog, cfg.Web.FrontendAddress),
  ReadTimeout:  cfg.Web.ReadTimeout,
  WriteTimeout: cfg.Web.WriteTimeout,
  ErrorLog:     discardLog,
}

// Make a channel to listen for errors coming from the listener. Use a
// buffered channel so the goroutine can exit if we don't collect this error.
serverErrors := make(chan error, 1)

// Start the service listening for requests.
go func() {
  log.Printf("main : API listening on %s", api.Addr)
  if cfg.Web.Production {
    serverErrors <- api.ListenAndServe()
  } else {
    serverErrors <- api.ListenAndServeTLS("./tls/cert.pem", "./tls/key.pem")
  }
}()
// ...
}
```

So we need two separate buffered channels: one for server errors and the other for signals of type `os.Signal`, which we plan to gracefully shutdown for.

```go
serverErrors := make(chan error, 1)
shutdown := make(chan os.Signal, 1)
```

We can capture signals with the signal package's Notify function. It takes a channel as its first argument and a list of signals you wish to subscribe to.

```go
signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)
```

Next we use the select block, which looks like a switch statement but it's really only used for channel send and receive operations. The select handles to case one that receives from the serverErrors channel and the other that receives from the shutdown channel.

```go

func main() error {
// ...

// Make a channel to listen for an interrupt or terminate signal from the OS.
// Use a buffered channel because the signal package requires it.
signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

// =========================================================================
// Shutdown

// Blocking main and waiting for shutdown.
select {
case err := <-serverErrors:
  return errors.Wrap(err, "listening and serving")

case sig := <-shutdown:
  log.Println("main : Start shutdown", sig)

  // Give outstanding requests a deadline for completion.
  ctx, cancel := context.WithTimeout(context.Background(), cfg.Web.ShutdownTimeout)
  defer cancel()

  // Asking listener to shutdown and load shed.
  err := api.Shutdown(ctx)
  if err != nil {
    log.Printf("main : Graceful shutdown did not complete in %v : %v", cfg.Web.ShutdownTimeout, err)
    err = api.Close()
  }

  // Log the status of this shutdown.
  switch {
  case sig == syscall.SIGSTOP:
    return errors.New("integrity issue caused shutdown")
  case err != nil:
    return errors.Wrap(err, "could not stop server gracefully")
  }
}

return nil
}
```

## Error Handling

errors get bubbled up to the main.go file. The run function is the only place in the application that can throw a fatal error.

We are ready discussed the need to graceful shutdown which occurs which may occur due to signals outside the application. But what happens if the application it self wishes to shutdown it also need a mechanism to signal a shutdown.

```go
// shutdown is a type used to help with the graceful termination of the service.
type shutdown struct {
  Message string
}

// Error is the implementation of the error interface.
func (s *shutdown) Error() string {
  return s.Message
}

// NewShutdownError returns an error that causes the framework to signal
// a graceful shutdown.
func NewShutdownError(message string) error {
  return &shutdown{message}
}

// IsShutdown checks to see if the shutdown error is contained
// in the specified error value.
func IsShutdown(err error) bool {
  if _, ok := errors.Cause(err).(*shutdown); ok {
    return true
  }
  return false
}
```

```go
// App is the entry point for all applications
type App struct {
  mux      *chi.Mux
  log      *log.Logger
  mw       []Middleware
  shutdown chan os.Signal
}

// New App constructs internal state for a new  app
func NewApp(shutdown chan os.Signal, logger *log.Logger, mw ...Middleware) *App {
  return &App{
    log:      logger,
    mux:      chi.NewRouter(),
    mw:       mw,
    shutdown: shutdown,
  }
}
```

```go
// Handle associates a handler function with an HTTP Method and URL pattern.
//
// It converts our custom handler type to the std lib Handler type. It captures
// errors from the handler and serves them to the client in a uniform way.
func (a *App) Handle(method, url string, h Handler) {

  h = wrapMiddleware(a.mw, h)

  fn := func(w http.ResponseWriter, r *http.Request) {
    v := Values{
      Start: time.Now(),
    }

    ctx := r.Context()                          // get original context
    ctx = context.WithValue(ctx, KeyValues, &v) // create a new context with new key/value
    // you can't directly update a request context
    r = r.WithContext(ctx) // create a new request and pass context

    // Call the handler and catch any propagated error.
    if err := h(w, r); err != nil {
      a.log.Printf("ERROR : unhandled error\n %+v", err)
      if IsShutdown(err) {
        a.SignalShutdown()
      }
    }
  }

  a.mux.MethodFunc(method, url, fn)
}
```

The App Handle method will call the handler and catch any propagated error. If the error is a shutdown
we call the SignalShutdown function to gracefully shutdown the app which sends a `syscall.SIGSTOP` signal down
the shutdown channel.

```go

// SignalShutdown is used to gracefully shutdown the app when an integrity
// issue is identified.
func (a *App) SignalShutdown() {
  a.log.Println("error returned from handler indicated integrity issue, shutting down service")
  a.shutdown <- syscall.SIGSTOP
}
```

The signal is received at the the other end of the shutdown channel and handled by the `select` in the main function.

## Handling Requests

The application has its own web frameworks, located in the platform folder. It's used to handle web requests, responses and potential errors.

## Middleware

The application has its own middleware mechanism.

![](/media/middleware.png)

## Seeding & Migrations

Seeding and migrations can be performed outside the project Go code and from within the admin application. Performing seeding and migrations with go-migrate. In the makefile we make use of go-migrate within a container however in the admin application we use go code. Both implementation make use of the internal schema folder where seed and migration files are stored and accumulated as the project database grows in size and complexity. Performing seeding and migration task via a makefile is for convenience but through Go code it is essential to the for integration tests to be able to programmatically setup a temporary database to run test against successfully.

## Integration Testing

Integration tests use testcontainers-go. A testing library ported from Java originally and now available in many languages. With it, we can programmatically create a postgres database container for go tests. There are many benefits to using the library for integration testing. Before its use, the following problems were in common place in go programs when needing to run integration tests and containers.

...

The benefits are:

...

Let's review how we are using the library.

...

# Demo

## Getting Started

Clone the project repo and checkout `part2`.

```bash
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout part2
```

Please review [Setting Up VSCode](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker#setting-up-vscode) to avoid intellisense errors in VSCode. This occurs because the Go module directory is not the project root.

## The Goal

Our goal is going from an empty database to a seeded one. We will create a database container as a background process. Then make a couple migrations, and finally seed the database before running the project.

## Step 1) Copy .env.sample and rename it to .env

The contents of `.env` should look like this:

```makefile
# DEVELOPMENT ENVIRONMENT VARIABLES

API_PORT=4000
PPROF_PORT=6060
CLIENT_PORT=3000

POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_NET=postgres-net

REACT_APP_BACKEND=http://localhost:4000/v1
```

## Step 2) Unblock port 5432 for Postgres

Our makefile and docker-compose yaml file will reference the standard postgres port: `5432`. Before continuing, close any existing postgres connections to free up that port.

## Step 3) Create self-signed certificates

Generate the required certificates. These certificates will be automatically placed under `./api/tls/`.

```bash
make cert
```

![](/media/cert.png)

## Step 4) Setup up the Postgres container

The database will run in the background with the following command:

```bash
make db
```

![](/media/db.png)

#### Create your first migration

Make a migration to create a products table.

```bash
make migration create_products_table
```

![](/media/create-products.png)

Databases have a tendency to grow. We use migrations to make changes to the postgres database. Migrations are used to _upgrade_ or _downgrade_ the database structure. Add SQL to both `up` & `down` migrations.

The files are located under: `./api/internal/schema/migrations/`.

**Up Migration**

```sql
-- 000001_create_products_table.up.sql

CREATE TABLE products (
    id UUID not null unique,
    name varchar(100) not null,
    price real not null,
    description varchar(100) not null,
    created timestamp without time zone default (now() at time zone 'utc')
);
```

**Down Migration**

```sql
-- 000001_create_products_table.down.sql

DROP TABLE IF EXISTS products;
```

The down migration simply reverts the up migration if we need to.

![](/media/create-products-migrations.png)

#### Create a second migration

Let's include tagged information for each product. Make another migration to add a tags Column to the products table.

```bash
make migration add_tags_to_products
```

![](/media/add-tags.png)

**Up Migration**

```sql
-- 000002_add_tags_to_products.up.sql

ALTER TABLE products
ADD COLUMN tags varchar(255);
```

**Down Migration**

```sql
-- 000002_add_tags_to_products.down.sql

ALTER TABLE products
DROP Column tags;
```

We have 2 migrations but we yet to apply them. Migrate the database up to the latest migration.

```bash
make up
```

Now if we print out the selected migration version, it should render `2`, the number of total migrations.

```bash
make version
```

![](/media/up-version.png)

#### Seeding the database

The database is still empty. Create a seed file for the products table.

```bash
make seed products
```

This adds an empty `products.sql` seed file to the project. Located under: `./api/internal/schema/seeds/products.sql`.

Add the following SQL content. This data will be used during local development.

```sql
-- ./api/internal/schema/seeds/products.sql

INSERT INTO products (id, name, price, description, created) VALUES
('cbef5139-323f-48b8-b911-dc9be7d0bc07','Xbox One X', 499.00, 'Eighth-generation home video game console developed by Microsoft.','2019-01-01 00:00:01.000001+00'),
('ce93a886-3a0e-456b-b7f5-8652d2de1e8f','Playstation 4', 299.00, 'Eighth-generation home video game console developed by Sony Interactive Entertainment.','2019-01-01 00:00:01.000001+00'),
('faa25b57-7031-4b37-8a89-de013418deb0','Nintendo Switch', 299.00, 'Hybrid console that can be used as a stationary and portable device developed by Nintendo.','2019-01-01 00:00:01.000001+00')
ON CONFLICT DO NOTHING;
```

![](/media/seed.png)

Finally, apply the seed data to the database.

```bash
make insert products
```

![](/media/insert.png)

Great, now the database is ready! The output should be `INSERT 0 3`. The 3 represents the 3 rows inserted. You can ignore the 0 representing [OIDS](https://www.postgresql.org/message-id/4AD5F063.8050708@iol.ie).

## Step 5) Run the frontend and backend

```bash
make api
make client
```

![run containers](/media/run.png "run containers")

First, navigate to the API in the browser at: <https://localhost:4000/v1/products>.

Then navigate to the client app at: <https://localhost:3000> in a separate tab.

_**Note:**_
_To replicate the production environment as much as possible locally, we use self-signed certificates. In your browser, you may see a warning and need to click a link to proceed to the requested page. This is common when using self-signed certificates._

![](/media/demo.png)

## Step 6) Run unit and integration tests

Along with unit tests, our tests setup a temporary postgres database for testing. Under the hood it's using Docker programmatically.

```bash
make test-api
```

![](/media/test.png)

### Optional Step) Idiomatic Go development

Containerizing to Go API is optional, so you can work with the API in an idiomatic fashion. This also means you can opt-out of live reloading. To configure the API, use command line flags or exported environment variables.

```bash
export API_DB_DISABLE_TLS=true
cd api
go run ./cmd/api
# or go run ./cmd/api --db-disable-tls=true
```

## Summary

A lot is happening let's recap. This demonstration included seeding and migrations to handle a growing postgres database. We went from no database, to an empty one, to a seeded one, using a makefile workflow. Running the API with `make api` still uses docker-compose and live reload (like in Part 1). But now we can opt-out of live reload and containerizing the API in development with `go run ./cmd/api`, optionally supplying cli flags or exported environment variables.

During testing, we programmatically created a temporary database. In the background, the test database leveraged the same seeding and migration functionality we saw earlier. This enables our tests to set things up before they run.

# Conclusion
