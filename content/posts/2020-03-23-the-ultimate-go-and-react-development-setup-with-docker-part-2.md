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

[Part 1](https://blog.ivorscott.com/ultimate-go-react-development-setup-with-docker) demonstrated how to streamline a development workflow using Docker, docker-compose and Makefiles. This post covers “Building An API”. I'll share the challenges I faced building production ready APIs in Go. Then walk through the API implementation so you get a deep understanding of its components. After that, we'll see a demo and discover how the workflow has changed. [Skip straight to the demo](#demo) if you want. This post is quite long.

We focus on:

- [Challenges](#challenges)
- [The API](#the-api)
- [Package Oriented Design](#package-oriented-design)
- [Configuration](#configuration)
- [Docker Secrets](#configuration)
- [Graceful Shutdown](#graceful-shutdown)
- [Middleware](#middleware)
- [Handling Requests](#requests)
- [Error Handling](#error-handling)
- [Seeding & Migrations](#seeding--migrations)
- [Integration Testing](#integration-testing)
- [Profiling](#profiling)
- [A Demo](#demo)

## Requirements

- [VSCode](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/products/docker-desktop)

# Challenges

Migrating from Node to Go is challenging. Beyond language syntax and mechanics, I faced 3 big challenges when building production ready services.

1. <div title="general" style="display:inline;background-color: #FFFB78">Rethinking the way you structure your app.</div> For example, you can't have circular dependencies in Go, the application won't compile if you do.

2. <div title="general" style="display:inline;background-color: #FFFB78">Building your own packages with built-in libraries or full-featured 3rd-parties packages.</div> There are benefits and disadvantages to each.

3. <div title="general" style="display:inline;background-color: #FFFB78">Using an ORM or going bare metal with SQL.</div> An ORM might get you to your destination faster but there are trade-offs to consider.

A few basic API tutorials left me eager to find a complete production ready example I could understand and tinker with. Ardan Labs scratched my itch. I heard about them last year and attended a workshop. I received a lot of ideas and it accelerated my path to success. I highly recommend their [workshops](https://www.eventbrite.com/o/ardan-labs-7092394651?utm_source=ardan_website&utm_medium=scrolling_banner&utm_campaign=website_livestream_promo) and [courses](https://education.ardanlabs.com/).

<blockquote class="twitter-tweet"><p lang="en" dir="ltr">First day of training has been intense! <a href="https://twitter.com/hashtag/golang?src=hash&amp;ref_src=twsrc%5Etfw">#golang</a> <a href="https://twitter.com/hashtag/ultimategotraining?src=hash&amp;ref_src=twsrc%5Etfw">#ultimategotraining</a> <a href="https://t.co/wdEQ5MrxK0">pic.twitter.com/wdEQ5MrxK0</a></p>&mdash; ivorscott (@ivorsco77) <a href="https://twitter.com/ivorsco77/status/1182291425830019074?ref_src=twsrc%5Etfw">October 10, 2019</a></blockquote>

# The API

My demo API is actually an extension of the [Ardan Labs service example](https://github.com/ardanlabs/service). I simply extended it, adding cors, go-migrate, testcontainers-go, a fluent SQL generator, self-signed certificates, and docker secrets. I'm going to talk about the API features I find interesting. I hope you'll learn something and feel confident in navigating the [source code](https://github.com/ivorscott/go-delve-reload/tree/part2) on your own.

![architecture](/media/architechture.png)

## Package Oriented Design

<div><div title="definition" style="display:inline;background-color: #D2F774">Package Oriented Design is a design strategy and project structure Ardan Labs uses to enforce good design guidelines meant to keep projects organized and sustainable as they grow.</div> The strategy derives from 3 goals: <i>purpose, usability and portability</i>.</div>

Package Oriented Design suggests _Application Projects_ should have a `/cmd` and `/internal` folder at the root of the project. The cmd folder houses the main applications for the project if there are more than one, for example, an api, cli etc., and the internal folder contains any code that should be kept internal to the project. The internal folder is necessary because breaking changes may occur when a project's public API surface changes. This idea is described by _Hyrum's law:_

<blockquote title="evidence">
<div title="general" style="display:inline;background-color: #FFFB78">
"With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody."</div>

-- Winters, Titus. Software Engineering at Google. Lessons Learned from Programming Over Time. O'REILLY, 2020. </blockquote>

When you use the term _internal_ as a folder name you receive compiler protection in Go. This is a very cool idea. Any package that exists under internal will be restricted so that they can only be imported by other packages that are apart of the same root folder.

![architecture](/media/internal-folder.png)

In Package Oriented Design, the internal packages are split into two types: _business_ and _platform specific_ logic. A _platform_ folder contains the core packages of the project that are unrelated to the business domain. For example, the platform folder in the demo contains 3 foundational packages: _the database, configuration and web packages._

![architecture](/media/internal-platform.png)

Everything else in the internal folder supports the business domain. That's all you need to know for now. To learn more about package oriented design, here's a couple articles about [the strategy](https://www.ardanlabs.com/blog/2017/02/package-oriented-design.html) and [the philosophy behind it](https://www.ardanlabs.com/blog/2017/02/design-philosophy-on-packaging.html). In addition, to the cmd and internal folders, also have `tls` and `pkg` folders. The tls folder holds self-signed certificates and pkg contains reusable packages that might be used in other projects. A [repository](https://github.com/golang-standards/project-layout) exists that documents standard Go project layout ideas. In the end, their are no strict guidelines but common patterns you may see across projects. In the next section, I'll discuss configuration.

![architecture](/media/pkg.gif)

## Configuration

In Part 1, API configuration came from environment variables in the docker-compose file. But it was dependent on docker secret values, making it harder to opt-out of docker in development. Furthermore, we didn't support any configuration tool for variables that weren't secret. I chose to reserve docker secrets for production and adopt the [Ardan Labs configuration package](https://github.com/ardanlabs/conf). The package supports both environment variables and command line arguments. Now we can opt-out of docker if we want a more idiomatic Go API development workflow. In doing this, we keep the integrity of our service. I copied and pasted the package directly under: `./api/internal/platform/conf`.

The package takes struct fields and translates them to cli flags and environment variables. The struct field `cfg.Web.Production` in cli form would be `--web-production`. But in environment variable form it is `API_WEB_PRODUCTION`. Notice as an environment variable there's an extra namespace. This ensures we only parse the vars we expect. This also reduces name conflicts. In our case that namespace is `API`.

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

The configuration package requires a nested struct describing the configuration fields. Each field has a type and default value supplied in a struct tag. The _noprint_ value in the struct tag can be used to omit secret data from logging. Next we parse the arguments, as environment variables or command line flags:

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

When necessary we may abstract some environment variables into a centralized location and pull them in. When an `.env` file exists in the same directory as the docker-compose file, we can reference the variables. To do this, prefix a dollar sign before the environment variable name. For example: `$API_PORT` or `$CLIENT_PORT`. This allows for better maintenance of configuration defaults, especially when values are referenced in multiple places.

Both the Makefile and the docker-compose file take advantage of the following `.env` file:

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

## Docker Secrets

<div><div style="display:inline;background-color: #D2F774">A docker secret is data that shouldn't be sent over a network or stored unencrypted in a Dockerfile or in your app's code.</div> Something like a password, private key, or TLS certificate. They are only available in Docker 13 and higher. We use Docker secrets to centralize secret management and securely pass them strictly to the containers that need access. They are encrypted during transit and at rest.</div>

<a href="https://docs.docker.com/engine/swarm/secrets/" target="_blank" onMouseOver="this.style.color='#F7A046'" 
onMouseOut="this.style.color='#5D93FF'" style="color:#5D93FF">Docker secrets</a> are a Swarm specific construct. That means they aren't secret outside of Swarm. They only work in docker-compose file because docker-compose doesn't complain when it sees them [PR #4368](https://github.com/docker/compose/pull/4368). The Go API only supports Docker secrets when `cfg.Web.Production` is true. So it's already set up for Swarm usage. When this happens we swap out the default database configuration with secrets.

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

To handle secrets I'm using a slightly modified version of a [secrets package](https://github.com/ijustfool/docker-secrets) I found on the internet. It's located under: `/api/pkg/secrets/secrets.go`

The `NewDockerSecrets` method reads All the secrets located in the secrets directory. By default that's /run/secrets. Then it creates a mapping that can be accessed by the `Get` method. More on Docker secrets when we get to production (discussed in Part 4, _"Docker Swarm and Traefik"_).

## Graceful Shutdown

With production services you shouldn't immediately shutdown when an error occurs. You want to shutdown gracefully to give any requests a chance to finish.

![](/media/graceful-shutdown.png)

First thing to do is handle potential server errors separately from interrupt and termination signals perhaps caused by the operating system or even Docker Engine (when we deploy). When a server error occurs it will do so immediately and in these cases we don't want to gracefully shutdown. If the server can't start then we should shutdown immediately. We capture server errors when the api listens and serves.

```go
// api/cmd/api/main.go
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

To illustrate how requests are handled by the service we can imagine creating a simple POST request to create a product and take a look at the data transformations between function calls. The application has its own web framework, composed of: each will be discussed briefly in the section. Located in the platform folder, the `web` package is used to handle all web requests, responses and potential errors.

![](/media/why.gif)

[explain]

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

[explain]

```go
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
```

[explain]

```go
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
```

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

## Profiling

<div>
To measure how our programs are performing we use profiling. <i>The Go Programming langauge</i> by Alan A. A. Donovan and Brian W. Kernighan writes, <div style="display:inline;background-color: #D2F774">"Profiling is an automated approach to performance measurement based on sampling a number of profile events during the execution, then extrapolating from them during a post-processing step; the resulting statistical summary is called a profile".</div> Amazingly, Go supports many kinds of profiling. The standard library supports profiling with a package named <a href="https://golang.org/pkg/net/http/pprof/" target="_blank">pprof</a>. Here's a few predefined profiles pprof provides:</div>

- block: stack traces that led to blocking on synchronization primitives
- goroutine: stack traces of all goroutines
- heap: sampling traces of all current goroutines
- mutex: stack traces of holders of contended mutexes
- profile: CPU profile

![](/media/experiement.gif)

Using pprof to measure an API, involves importing `net/http/pprof` the standard HTTP interface to profiling data. Since we don't use the import directly and just wish to use its side effects we place and \_ in front of the import. The import will register handlers under /debug/pprof/ using the DefaultServeMux. If you are not using the DefaultServeMux you need to register the handlers with the mux your are using. It's worth noting, that these handlers should not be accessible to the public because of this we use the DefaultServerMux on a dedicated port in a separate goroutine to leverage pprof.

```go
// api/cmd/api/main.go
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

Some additional utilities you may want to install are an HTTP load generator like [hey](https://github.com/rakyll/hey) and [graphviz](http://graphviz.gitlab.io/download/) to visualize a cpu profile in a web page.

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

Afterward we can run the command `top -cum` (to sort by the fourth and fifth columns) to analyze the profile captured. The fourth and fifth columns indicate the number of samples that the function appeared in (while running or waiting for a function to return).

![](/media/profiler.png)

Or view a visualization by typing `web` into the pprof command prompt which will automatically open a web browser window.

![](/media/web.png)

![simple right?](/media/notreally.gif)

Just Kidding! It's a lot to digest and super challenging to fit into one post. That's one of the reasons I left out authentication and observability metrics. Enough technical talk. Let's dive into a demo and see it in action.

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

We saw that project structure is a big deal in GO. You're going to have a difficult time laying out your project architecture in Go if you are used to creating folders to organize your code. In demonstrating the web framework, we saw that at times it's best to build things yourself to not build a black box bewteen components. The choice between whether or not to use an ORM is a big deal that can come back to haunt you later, the less data abstraction layers the more transparent your architecture will be. There's a ton of value working with a transparent architecture you actually understand.
People coding in Go as their first language may have an advantage here, coming from Node I have to unlearn habits that are preceived as code smell in Go. But I truly believe the langauge is worth mastering because of it's design choices, concurrency model, code profiling tools, and great standard library.
