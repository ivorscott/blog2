---
template: post
title: Building an API with Go pt.3
slug: ultimate-go-react-development-setup-with-docker-part3
draft: false
date: 2020-03-23T10:55:15.296Z
description: >-
  How do you build an production ready Go API? What components matter?
category: "Go and React Series"
tags:
  - Docker Golang React Makefile Postgres Testing Migrations Seeding
socialImage: "/media/part3.jpg"
---

<!-- PART OF A SERIES -->
<center>
<i>
  <a href ="/category/go-and-react-series/">Part of the Go and React Series</a>
</i>
</center>

![](/media/part3.jpg)

# Introduction

[Part 2](/ultimate-go-react-development-setup-with-docker-part2) was about some challenges I faced in migrating to a Go API. This post covers the components of a production ready Go API.

My demo API is actually an extension of the [Ardan Labs service example](https://github.com/ardanlabs/service). I simply extended it, adding cors, go-migrate, testcontainers-go, a fluent SQL generator, self-signed certificates, and docker secrets. I'm going to talk about the API implementation and bring up related ideas when necessary. I hope you'll feel confident in navigating the source code on your own.

We focus on:

- [Package Oriented Design](#package-oriented-design)
- [Configuration](#configuration)
- [Database Connection](#database-connection)
- [Docker Secrets](#docker-secrets)
- [Graceful Shutdown](#graceful-shutdown)
- [Middleware](#middleware)
- [Handling Requests](#handling-requests)
- [Error Handling](#error-handling)
- [Seeding & Migrations](#seeding--migrations)
- [Integration Testing](#integration-testing)

## Requirements

- [VSCode](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/products/docker-desktop)

## Getting Started

Clone the project repo and checkout `part3`.

```bash
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout part3
```

Please review [Setting Up VSCode](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker#setting-up-vscode) to avoid intellisense errors in VSCode. This occurs because the Go module directory is not the project root.

## Package Oriented Design

![architecture](/media/architechture.png)

<div><div title="definition" style="display:inline;background-color: #D2F774">Package Oriented Design is a design strategy and project structure Ardan Labs uses to enforce good design guidelines meant to keep projects organized and sustainable as they grow.</div> The strategy derives from 3 goals: <i>purpose, usability and portability</i>.</div>

Package Oriented Design suggests _Application Projects_ should have `cmd` and `internal` folders at the root of the project. The cmd folder houses the main applications for the project, given the likelihood of there being more than one, for example, an api, cli, web app etc. The internal folder contains any code that should be kept internal to the project. The internal folder is necessary because breaking changes may occur when a project's public API surface changes. This idea is described by _Hyrum's law:_

<blockquote title="evidence">
<div title="general" style="display:inline;background-color: #FFFB78">
"With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody."</div>

-- Winters, Titus. Software Engineering at Google. Lessons Learned from Programming Over Time. O'REILLY, 2020. </blockquote>

By using the term _internal_ as a folder name you receive compiler protection in Go. Packages that exist under internal will be restricted so that they are only imported by packages apart of the same root folder.

![architecture](/media/internal-folder.png)

In Package Oriented Design, the internal packages are split into two types: _business_ and _platform specific_ logic. A _platform_ folder contains the core packages of the project that are unrelated to the business domain. For example, the platform folder in the demo contains 3 foundational packages: _the database, configuration and web packages._

![architecture](/media/internal-platform.png)

Everything else in the internal folder supports the business domain. To learn more about package oriented design, here's a couple articles about [the strategy](https://www.ardanlabs.com/blog/2017/02/package-oriented-design.html) and [the philosophy](https://www.ardanlabs.com/blog/2017/02/design-philosophy-on-packaging.html) behind it. Top level packages also include `tls` and `pkg` folders. The tls folder holds self-signed certificates and pkg contains reusable packages that might be used in other projects. A [github repository](https://github.com/golang-standards/project-layout) documents the standard project layout ideas in Go. However, there are no strict guidelines, only common patterns you may see across projects. In the end, every developer is responsible for designing their own structure. Define a set of guidelines and stick to them. This will help you establish a mental model of your codebase. Not knowing where things belong is a sign that you haven't established a system.

![architecture](/media/pkg.gif)

## Configuration

In Part 1, API configuration came from environment variables in the docker-compose file. Unfortunately, the old approach was dependent on docker and docker secret values, making it harder to opt-out of a containerized API in development. Furthermore, there was no way of retrieving non-secret configuration values. The new approach reserves docker secrets for production and adopts the [Ardan Labs configuration package](https://github.com/ardanlabs/conf). The package supports both environment variables and command line arguments. Now we can opt-out of docker if we want a more idiomatic Go API development workflow. I copied and pasted the package directly under: `api/internal/platform/conf`.

The package takes struct fields and translates them to cli flags and environment variables. The struct field `cfg.Web.Production` in cli form would be `--web-production`. But in environment variable form it is `API_WEB_PRODUCTION`. Notice as an environment variable there's an extra namespace. This ensures we only parse the variables we expect. This also reduces name conflicts. In our case that namespace is `API`.

```go
// api/cmd/api/main.go
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

The configuration package requires a nested struct describing the configuration fields. Each field has a type and default value supplied in a struct tag. The `noprint` value in the struct tag is used to omit data from being printed. Next we parse the arguments, as environment variables or command line flags:

```go
// api/cmd/api/main.go
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

If there's a `ErrHelpWanted` error we reveal usage instructions. Here's the configuration fields applied in the docker-compose file with the API namespace:

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

When necessary we may abstract some environment variables into a centralized location and pull them in. When an `.env` file exists in the same directory as the docker-compose file, we can reference the variables. To do this, prefix a dollar sign before an environment variable name like `$API_PORT`. This allows for better maintenance of default values when values are referenced outside the program in multiple places.

For example, both the Makefile and the docker-compose file take advantage of the following `.env` file:

```makefile
# .env

# ENVIRONMENT VARIABLES

API_PORT=4000
PPROF_PORT=6060
CLIENT_PORT=3000

POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_NET=postgres-net

REACT_APP_BACKEND=https://localhost:4000/v1
API_WEB_FRONTEND_ADDRESS=https://localhost:3000
```

## Database Connection

The database package has an important function named `NewRepository()`. It takes the necessary database configuration values as arguments and returns a `Repository` struct containing
the database connection pointer, a query builder named [Squirrel](https://github.com/Masterminds/squirrel) and a URL struct representing a parsed URL.

```go
// api/cmd/internal/platform/database/database.go
type Repository struct {
	DB  *sqlx.DB
	SQ  squirrel.StatementBuilderType
	URL url.URL
}
```

I kept the URL struct around for convenience to reveal the connection string on demand: `URL.String()`. For example, here's how we make a database connection.

```go
// api/cmd/internal/platform/database/database.go
db, err := sqlx.Open("postgres", u.String())
```

After creating a new repository we immediately handle any error connecting and use a `defer` statement to close the connection when the surrounding function returns since we are done with it.

```go
// api/cmd/api/main.go
repo, err := database.NewRepository(database.Config{
  User:       cfg.DB.User,
  Host:       cfg.DB.Host,
  Name:       cfg.DB.Name,
  Password:   cfg.DB.Password,
  DisableTLS: cfg.DB.DisableTLS,
})
if err != nil {
  return errors.Wrap(err, "connecting to db")
}
defer repo.Close()
```

## Docker Secrets

<div><div style="display:inline;background-color: #D2F774">A docker secret is data that shouldn't be sent over a network or stored unencrypted in a Dockerfile or in your app's code.</div> Something like a password, private key, or TLS certificate. They are only available in Docker 1.13 and higher. We use Docker secrets to centralize secret management and securely pass them strictly to the containers that need access. They are encrypted during transit and at rest.</div>

<a href="https://docs.docker.com/engine/swarm/secrets/" target="_blank" onMouseOver="this.style.color='#F7A046'" 
onMouseOut="this.style.color='#5D93FF'" style="color:#5D93FF">Docker secrets</a> are a Swarm specific construct. That means they aren't secret outside of Swarm. They only work in docker-compose because docker-compose doesn't complain when it sees them [PR #4368](https://github.com/docker/compose/pull/4368). The API is already set up for Docker secrets but only uses them when `cfg.Web.Production` is true. When this happens we swap out the default database configuration with secrets.

```go
// api/cmd/api/main.go
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

To handle secrets I'm using a slightly modified version of a [secrets package](https://github.com/ijustfool/docker-secrets) I found on the internet. It's located under: `api/pkg/secrets/secrets.go`

The `NewDockerSecrets()` method reads all the secrets located in the secrets directory. By default that's /run/secrets. Then it creates a mapping that can be accessed by the `Get` method. More on Docker secrets when we get to production (discussed in Part 4, _"Docker Swarm and Traefik"_).

## Graceful Shutdown

With production services you shouldn't immediately shutdown when an error occurs. You want to shutdown gracefully to give any requests a chance to finish.

![](/media/graceful-shutdown.png)

First thing to do is handle potential server errors separately from interrupt and termination signals perhaps caused by the operating system or even Docker Engine (when we deploy). When a server error occurs it will do so immediately and in these cases we don't want to gracefully shutdown. If the server can't start then we should shutdown immediately. We capture server errors when the api listens and serves.

```go
// api/cmd/api/main.go
var discardLog *log.Logger

if !cfg.Web.Production {
  // hide "tls: unknown certificate" errors due to self-signed certificates
  // In development prevent the server from logging errors on its own
  discardLog = log.New(ioutil.Discard, "", 0)
}

shutdown := make(chan os.Signal, 1)

api := http.Server{
  Addr:         cfg.Web.Address,
  Handler:      handlers.API(shutdown, repo, infolog, cfg.Web.FrontendAddress),
  ReadTimeout:  cfg.Web.ReadTimeout,
  WriteTimeout: cfg.Web.WriteTimeout,
  ErrorLog:     discardLog,
}

serverErrors := make(chan error, 1)

go func() {
  log.Printf("main : API listening on %s", api.Addr)
  if cfg.Web.Production {
    serverErrors <- api.ListenAndServe()
  } else {
    serverErrors <- api.ListenAndServeTLS("./tls/cert.pem", "./tls/key.pem")
  }
}()
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
// api/cmd/api/main.go
signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

select {
case err := <-serverErrors:
  return errors.Wrap(err, "listening and serving")
case sig := <-shutdown:
  log.Println("main : Start shutdown", sig)
  ctx, cancel := context.WithTimeout(context.Background(), cfg.Web.ShutdownTimeout)
  defer cancel()
  err := api.Shutdown(ctx)
  if err != nil {
    log.Printf("main : Graceful shutdown did not complete in %v : %v", cfg.Web.ShutdownTimeout, err)
    err = api.Close()
  }
  switch {
  case sig == syscall.SIGSTOP:
    return errors.New("integrity issue caused shutdown")
  case err != nil:
    return errors.Wrap(err, "could not stop server gracefully")
  }
}
```

## Middleware

A middleware is a function that intercepts the request and response provided by an HTTP server in order to execute logic and then it either ends the response early in the event of integrity error or it calls the next middleware. The demo uses a custom implementation of middleware instead of leveraging 3rd party packages like [Alice](https://github.com/justinas/alice) or [negroni](https://github.com/urfave/negroni).

When a request comes in it travels through a set of middleware layers before reaching the handler and then back out again.

![](/media/middleware.png)

Middleware functions are passed down to the custom web framework located in the `api/cmd/api/internal/routes.go`.

```go
// api/cmd/api/internal/routes.go
app := web.NewApp(shutdown, log, mid.Logger(log), mid.Errors(log), mid.Panics(log))
```

The api/internal/mid package contains all the middleware for the service. In a future post I will additional middleware for auth and metrics.

The web package will take each handler and wrap it in the middleware set. It does this by leveraging `web.wrapMiddleware(mw []Middleware, handler Handler)`, which takes a slice of middleware and a handler as arguments.

```go
// api/internal/platform/web/middleware.go
type Middleware func(Handler) Handler

func wrapMiddleware(mw []Middleware, handler Handler) Handler {
  for i := len(mw) - 1; i >= 0; i-- {
    h := mw[i]
    if h != nil {
      handler = h(handler)
    }
  }
  return handler
}
```

To stick to the correct order, the code loops backwards invoking each middleware in the variadic set and then creates a new wrapped handler.

[explain]

```go
func Logger(log *log.Logger) web.Middleware {
  f := func(before web.Handler) web.Handler {
    h := func(w http.ResponseWriter, r *http.Request) error {
      v, ok := r.Context().Value(web.KeyValues).(*web.Values)
      if !ok {
        return errors.New("web value missing from context")
      }
      err := before(w, r)
      log.Printf("(%d) : %s %s -> %s (%s)",
        v.StatusCode,
        r.Method, r.URL.Path,
        r.RemoteAddr, time.Since(v.Start),
      )
      return err
    }
    return h
  }
  return f
}
```

## Handling Requests

To illustrate how requests are handled by the service we can trace what happens when executing a `POST` request to create a product. Between each of the function calls is a data transformation. The application server listens for requests, the request matches a specific route and goes through a set of middleware before reaching a handler, that handler Decodes the JSON to Go code, the database records is validated, inserted, converted back to JSON and sent back out in the server response to the client.

![](/media/invocation-flow.png)

### Listens and Serve

We create a new http server and pass it the web address which defines our the port or server is listening on (defaults to 4000), some Timeout setting to configure when the server should timeout, the error logger to use and the main handler for the api.

```go
shutdown := make(chan os.Signal, 1)

// setup the http server
api := http.Server{
  Addr:         cfg.Web.Address,
  Handler:      handlers.API(shutdown, repo, infolog, cfg.Web.FrontendAddress),
  ReadTimeout:  cfg.Web.ReadTimeout,
  WriteTimeout: cfg.Web.WriteTimeout,
  ErrorLog:     discardLog,
}
```

### Route configuration

The main handler, `handlers.API` is a function that makes use of a custom web package or framework where all web related responsibilities are managed in one place. I also implements cors (Cross-origin resource sharing) to restrict resources requested from any domain not listed in the allowed origins. The first web package method we will see is web.NewApp which returns an application pointer. We pass it the main logger so it can log, use middleware to wrap the handlers in and the shutdown channel so that the App can trigger a shutdown. In this function we also setup the application route handlers and map a http verb `(GET, POST, PUT, DELETE)` and path to route handler available in the Products struct responsible for storing state to help us facilitate request handling. Before the Application handler is returned to the http server it is wrapped in cors pointer.

```go
// api/cmd/api/internal/routes.go
func API(shutdown chan os.Signal, repo *database.Repository, log *log.Logger, FrontendAddress string) http.Handler {
  app := web.NewApp(shutdown, log, mid.Logger(log), mid.Errors(log), mid.Panics(log))
  c := cors.New(cors.Options{
    AllowedOrigins:   []string{FrontendAddress},
    AllowCredentials: true,
  })
  p := Products{repo: repo, log: log}
  app.Handle(http.MethodGet, "/v1/products", p.List)
  app.Handle(http.MethodPost, "/v1/products", p.Create)
  app.Handle(http.MethodGet, "/v1/products/{id}", p.Retrieve)
  app.Handle(http.MethodPut, "/v1/products/{id}", p.Update)
  app.Handle(http.MethodDelete, "/v1/products/{id}", p.Delete)
  return c.Handler(app)
}
```

### The Web Framework

[explain]

```go
package web

import (
  "context"
  "log"
  "net/http"
  "os"
  "syscall"
  "time"

  "github.com/go-chi/chi"
)

type ctxKey int

const KeyValues ctxKey = 1

type Values struct {
  StatusCode int
  Start      time.Time
}

type Handler func(http.ResponseWriter, *http.Request) error

type App struct {
  mux      *chi.Mux
  log      *log.Logger
  mw       []Middleware
  shutdown chan os.Signal
}

func NewApp(shutdown chan os.Signal, logger *log.Logger, mw ...Middleware) *App {
  return &App{
    log:      logger,
    mux:      chi.NewRouter(),
    mw:       mw,
    shutdown: shutdown,
  }
}

func (a *App) Handle(method, url string, h Handler) {

  h = wrapMiddleware(a.mw, h)

  fn := func(w http.ResponseWriter, r *http.Request) {
    v := Values{
      Start: time.Now(),
    }

    ctx := r.Context()
    ctx = context.WithValue(ctx, KeyValues, &v)
    r = r.WithContext(ctx)

    if err := h(w, r); err != nil {
      a.log.Printf("ERROR : unhandled error\n %+v", err)
      if IsShutdown(err) {
        a.SignalShutdown()
      }
    }
  }

  a.mux.MethodFunc(method, url, fn)
}

func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
  w.Header().Set("Content-Type", "application/json")
  a.mux.ServeHTTP(w, r)
}

func (a *App) SignalShutdown() {
  a.log.Println("error returned from handler indicated integrity issue, shutting down service")
  a.shutdown <- syscall.SIGSTOP
}
```

### Route Handlers

[explain]

```go
func (p *Products) Create(w http.ResponseWriter, r *http.Request) error {
  var np product.NewProduct
  if err := web.Decode(r, &np); err != nil {
    w.WriteHeader(http.StatusBadRequest)
    return err
  }
  prod, err := product.Create(r.Context(), p.repo, np, time.Now())
  if err != nil {
    return err
  }
  return web.Respond(r.Context(), w, prod, http.StatusCreated)
}
```

### Request Validation

[explain]

```go
func Decode(r *http.Request, val interface{}) error {
  decoder := json.NewDecoder(r.Body)
  decoder.DisallowUnknownFields()
  if err := decoder.Decode(val); err != nil {
    return NewRequestError(err, http.StatusBadRequest)
  }
  if err := validate.Struct(val); err != nil {
    verrors, ok := err.(validator.ValidationErrors)
    if !ok {
      return err
    }
    lang, _ := translator.GetTranslator("en")
    var fields []FieldError
    for _, verror := range verrors {
      field := FieldError{
        Field: verror.Field(),
        Error: verror.Translate(lang),
      }
      fields = append(fields, field)
    }
    return &Error{
      Err:    errors.New("field validation error"),
      Status: http.StatusBadRequest,
      Fields: fields,
    }
  }
  return nil
}
```

By adopting an SQL query builder, not only do I have a better understanding of the queries that are being made to the database, I can resue my existing SQL knowledge from project to project. Bypassing the ineffiency of requests, and opaqueness that comes with ORM abastraction layers.

### Database Handlers

```go
func Create(ctx context.Context, repo *database.Repository, np NewProduct, now time.Time) (*Product, error) {
  p := Product{
    ID:          uuid.New().String(),
    Name:        np.Name,
    Price:       np.Price,
    Description: np.Description,
    Created:     now.UTC(),
    Tags:        np.Tags,
  }
  stmt := repo.SQ.Insert(
    "products",
  ).SetMap(map[string]interface{}{
    "id":          p.ID,
    "name":        p.Name,
    "price":       p.Price,
    "description": p.Description,
    "created":     p.Created,
    "tags":        p.Tags,
  })
  if _, err := stmt.ExecContext(ctx); err != nil {
    return nil, errors.Wrapf(err, "inserting product: %v", np)
  }
  return &p, nil
}
```

### Server Response

[explain]

```go
func Respond(ctx context.Context, w http.ResponseWriter, val interface{}, statusCode int) error {
  v := ctx.Value(KeyValues).(*Values)
  v.StatusCode = statusCode
  if statusCode == http.StatusNoContent {
    w.WriteHeader(statusCode)
    return nil
  }
  res, err := json.Marshal(val)
  if err != nil {
    return err
  }
  w.WriteHeader(statusCode)
  if _, err := w.Write(res); err != nil {
    return err
  }
  return nil
}
```

## Error Handling

Errors get bubbled up to the main.go file. The run function is the only place in the application that can throw a fatal error. We are ready discussed the need to graceful shutdown which occurs which may occur due to signals outside the application. But what happens if the application it self wishes to shutdown it also need a mechanism to signal a shutdown.

![](/media/smoke.gif)

[explain]

```go
package web

import "github.com/pkg/errors"

type FieldError struct {
  Field string `json:"field"`
  Error string `json:"error"`
}

type ErrorResponse struct {
  Error  string       `json:"error"`
  Fields []FieldError `json:"fields,omitempty"`
}

type Error struct {
  Err    error
  Status int
  Fields []FieldError
}

func NewRequestError(err error, status int) error {
  return &Error{Err: err, Status: status}
}

func (e *Error) Error() string {
  return e.Err.Error()
}

type shutdown struct {
  Message string
}

func (s *shutdown) Error() string {
  return s.Message
}

func NewShutdownError(message string) error {
  return &shutdown{message}
}

func IsShutdown(err error) bool {
  if _, ok := errors.Cause(err).(*shutdown); ok {
    return true
  }
  return false
}
```

The App Handle method will call the handler and catch any propagated error. If the error is a shutdown
we call the SignalShutdown function to gracefully shutdown the app which sends a `syscall.SIGSTOP` signal down
the shutdown channel.

```go
func (a *App) SignalShutdown() {
  a.log.Println("error returned from handler indicated integrity issue, shutting down service")
  a.shutdown <- syscall.SIGSTOP
}
```

### Error Handling Middleware

I deliberately left out some important functions from the Middleware section so I could address it here.

The API has two error handling middleware functions. One for errors and another to recover from panics.

[explain]

```go
func Errors(log *log.Logger) web.Middleware {
  f := func(before web.Handler) web.Handler {
    h := func(w http.ResponseWriter, r *http.Request) error {
      if err := before(w, r); err != nil {
        log.Printf("ERROR : %+v", err)
        if err := web.RespondError(r.Context(), w, err); err != nil {
          return err
        }
        if ok := web.IsShutdown(err); ok {
          return err
        }
      }
      return nil
    }
    return h
  }
  return f
}
```

[explain]

```go
func RespondError(ctx context.Context, w http.ResponseWriter, err error) error {
  if webErr, ok := errors.Cause(err).(*Error); ok {
    er := ErrorResponse{
      Error:  webErr.Err.Error(),
      Fields: webErr.Fields,
    }
    if err := Respond(ctx, w, er, webErr.Status); err != nil {
      return err
    }
    return nil
  }
  er := ErrorResponse{
    Error: http.StatusText(http.StatusInternalServerError),
  }
  if err := Respond(ctx, w, er, http.StatusInternalServerError); err != nil {
    return err
  }
  return nil
}
```

Panics are [explain]

```go
func Panics(log *log.Logger) web.Middleware {
  f := func(after web.Handler) web.Handler {
    h := func(w http.ResponseWriter, r *http.Request) (err error) {
      defer func() {
        if r := recover(); r != nil {
          err = errors.Errorf("panic: %v", r)
          log.Printf("%s", debug.Stack())
        }
      }()
      return after(w, r)
    }
    return h
  }
  return f
}
```

The signal is received at the the other end of the shutdown channel and handled by the `select` in the main function.

## Seeding & Migrations

Migrations can be performed in 2 ways: through a cli application and or the Makefile. Both implementations make use of [go-migrate](https://github.com/golang-migrate/migrate). The only difference is the Makefile leverages a [Docker image](https://hub.docker.com/r/migrate/migrate/). The Makefile implementation is for convenience since we are already adopting a Makefile workflow. The APIs use of the code implementation is out of necessity so that integration tests can perform seeding and migrations as well against a temporary test database.

![](/media/seeds.gif)

### Seeding & Migrating With The CLI

The CLI implementation is takes the go-migrate library and applies its methods from a switch case. We can seed and migrate up to the latest version.

[explain]

```go
// api/internal/schema/migrate.go
const dest = "/migrations"

func Migrate(dbname string, url string) error {
  src := fmt.Sprintf("file://%s%s", RootDir(), dest)
  m, err := migrate.New(src, url)
  if err != nil {
    log.Fatal(err)
  }
  if err := m.Up(); err != nil && err != migrate.ErrNoChange {
    log.Fatal(err)
  }
  return nil
}
```

[explain]

```go
// api/internal/schema/seed.go
const folder = "/seeds/"
const ext = ".sql"

func Seed(db *sqlx.DB, filename string) error {
  tx, err := db.Beginx()
  if err != nil {
    return err
  }
  src := fmt.Sprintf("%s%s%s%s", RootDir(), folder, filename, ext)
  dat, err := ioutil.ReadFile(src)
  if err != nil {
    return err
  }
  if _, err := tx.Exec(string(dat)); err != nil {
    if err := tx.Rollback(); err != nil {
      return err
    }
    return err
  }
  return tx.Commit()
}
```

[explain]

```go
// api/internal/schema/path.go
var (
  _, b, _, _ = runtime.Caller(0)
  basepath   = filepath.Dir(b)
)

func RootDir() string {
  return basepath
}
```

[explain]

```go
// api/cmd/admin/main.go
switch cfg.Args.Num(0) {
case "migrate":
  if err := schema.Migrate(cfg.DB.Name, repo.URL.String()); err != nil {
    return errors.Wrap(err, "applying migrations")
  }
  fmt.Println("Migrations complete")
  return nil

case "seed":
  if cfg.Args.Num(1) == "" {
    return errors.Wrap(err, "hint: seed <name> ")
  }
  if err := schema.Seed(repo.DB, cfg.Args.Num(1)); err != nil {
    return errors.Wrap(err, "seeding database")
  }
  fmt.Println("Seed data complete")
  return nil
}

fmt.Println("commands: migrate|seed <filename>")
return nil
```

With this code the both the admin cli `application api/cmd/admin/main.go` and `api/cmd/api/tests/products_tests.go` can seed and migrate.

### Seeding & Migrating With The Makefile

From the container perspective [usage](https://github.com/golang-migrate/migrate/tree/master/cmd/migrate#usage) of go-migrate is straight forward because it uses the same cli interface as the regular library.

Here's how we can create a migration:

```makefile
docker run \
--volume $(pwd)/api/internal/schema/migrations:/migrations \
--network postgres-net migrate/migrate create
-ext sql \
-dir /migrations \
-seq create_users_table
```

The Makefile implementation makes use of variables, args and syntactic sugar to allow the client code to look like this:

```bash
make migration <name>
```

Instead of this:

```bash
make migrations name=<name>
```

This cleaner syntax is possible by comparing the values found in `MAKECMDGOALS` at runtime. If the first word matches (migration, seed, or insert) we interpret the second word as the argument for the command and stored the value in a variable.

```makefile
# store the name argument
ifeq ($(firstword $(MAKECMDGOALS)),$(filter $(firstword $(MAKECMDGOALS)),migration seed insert))
  name := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  $(eval $(name):;@:)
endif

# store the number argument
ifeq ($(firstword $(MAKECMDGOALS)),$(filter $(firstword $(MAKECMDGOALS)),up down force))
  num := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
  $(eval $(num):;@:)
  ifndef num
    ifeq ($(firstword $(MAKECMDGOALS)),$(filter $(firstword $(MAKECMDGOALS)),down))
      num := 1
    endif
  endif
endif
```

The advantage of using the makefile versus the cli admin application is that you can migrate up and down.

```makefile
# makefile
migration:
  ifndef name
    $(error migration name is missing -> make migration <name>)
  endif

  # [ generating migration files ... ]
  docker run \
  --volume $(MIGRATIONS_VOLUME) \
  --network $(POSTGRES_NET) migrate/migrate \
  create \
  -ext sql \
  -dir /migrations \
  -seq $(name)

up:
  # [ migrating up ... ]
  docker run \
  --volume $(MIGRATIONS_VOLUME) \
  --network $(POSTGRES_NET) migrate/migrate \
  -path /migrations \
  -verbose \
  -database $(URL) up $(num)

down:
  # [ migrating down ... ]
  docker run \
  --volume $(MIGRATIONS_VOLUME) \
  --network $(POSTGRES_NET) migrate/migrate \
  -path /migrations  \
  -verbose \
  -database $(URL) down $(num)
```

Seeding the database is composed of three steps.

1. Generating a seed file
2. Adding SQL to that file, and then
3. Inserting it in the database.

```bash
make seed <name>
```

As soon as you create a seed file you are expected to add SQL to the generated file before you insert.

```bash
make insert <name>
```

```makefile
# makefile
seed:
  ifndef name
    $(error seed name is missing -> make insert <name>)
  endif
  # [ generating seed file ... ]
  mkdir -p $(PWD)/$(SEED_DIR)
  touch $(PWD)/$(SEED_DIR)/$(name).sql

insert:
  ifndef name
  $(error seed filename is missing -> make insert <filename>)
  endif
  # [ inserting $(name) seed data ... ]
  docker cp $(PWD)/$(SEED_DIR)/$(name).sql $(shell docker-compose ps -q db):/seed/$(name).sql \
  && docker exec -u root db psql $(POSTGRES_DB) $(POSTGRES_USER) -f /seed/$(name).sql
```

You will see seeding and migrations in action in the demo. For further reference checkout out this [PostgreSQL tutorial](https://github.com/golang-migrate/migrate/blob/master/database/postgres/TUTORIAL.md) from go-migrate.

## Integration Testing

[TestContainers-Go](https://github.com/testcontainers/testcontainers-go) is an amazing library providing a friendly API to run Docker containers. With it, we can programmatically create a postgres database container for go tests. There are many benefits to using the library for integration testing. You can avoid problems like host port conflicts, stale containers, CI headaches, and running tests prematurely before the database is ready.

Here's an example postgres container:

```go
// api/cmd/api/tests/product_test.go
pgc, err := tc.GenericContainer(ctx, tc.GenericContainerRequest{
  ContainerRequest: tc.ContainerRequest{
    Image:        "postgres",
    ExposedPorts: []string{postgresPort.Port()},
    Env: map[string]string{
      "POSTGRES_PASSWORD": cfg.DB.Password,
      "POSTGRES_USER":     cfg.DB.User,
    },
    WaitingFor: wait.ForAll(
      wait.ForLog("database system is ready to accept connections"),
      wait.ForListeningPort(postgresPort),
    ),
  },
  Started:          true,
})
```

[explain how it makes use of the seeding and migrations]

# Conclusion

We saw that project structure can be tricky in Go. Top level packages in the project can be used and depended on in other projects. Somethings don't need to be reusable. Leverage the internal folder to hide code from external projects and identify your business logic from the non-business domain logic. When considering bewteen frameworks, consider creating your own. The benefit of doing so is that you know what it does because you built it. Try to avoid creating black boxes in software. Choosing an ORM as abstraction layer is creating a black box in your data access layer which can come back to haunt you later. The less abstraction layers you have the more transparent your architecture will be. In the [next post](ultimate-go-react-development-setup-with-docker-part4) I demonstrate the API workflow during development.
