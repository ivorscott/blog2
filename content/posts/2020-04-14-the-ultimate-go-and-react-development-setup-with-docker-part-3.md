---
template: post
title: My API Workflow with Go pt.3
slug: ultimate-go-react-development-setup-with-docker-part3
draft: false
date: 2020-05-29T9:00:00.000Z
description: >-
  In this post I demo a Docker-based API workflow that involves seeding and migrating a Postgres database. After that, I show how to profile the API with pprof.
category: "Go and React Series"
tags:
  - Docker
  - Golang
  - React
  - Postgres
  - TestContainers
  - Migrations
  - Seeding
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

[Part 2](/ultimate-go-react-development-setup-with-docker-part2) was about transitioning to Go. This post contains a demo of a Docker-based API workflow inspired by the [Ardan Labs service example](https://github.com/ardanlabs/service). After the demo I'll end with how to profile the API with [pprof](https://golang.org/pkg/runtime/pprof/).

We focus on:

- [A Demo](#demo)
- [Profiling](#profiling)

## Requirements

- [VSCode](https://code.visualstudio.com/)
- [Docker](https://www.docker.com/products/docker-desktop)

# Demo

## Getting Started

Clone the project repo and checkout `part3`.

```bash
git clone https://github.com/ivorscott/go-delve-reload
cd go-delve-reload
git checkout part3
```

Please review [Setting Up VSCode](/ultimate-go-react-development-setup-with-docker#go-modules) to avoid intellisense errors in VSCode. This occurs because the project is a mono repo and the Go module directory is not the project root.

## The Goal

Our goal is going from an empty database to a seeded one. We will create a database container as a background process. Then make a couple migrations, and finally seed the database before running the project.

## Step 1) Copy .env.sample and rename it to .env

The contents of `.env` should look like this:

```makefile
# ENVIRONMENT VARIABLES

API_PORT=4000
PPROF_PORT=6060
CLIENT_PORT=3000

DB_URL=postgres://postgres:postgres@db:5432/postgres?sslmode=disable

REACT_APP_BACKEND=https://localhost:4000/v1
API_WEB_FRONTEND_ADDRESS=https://localhost:3000
```

## Step 2) Unblock port 5432 for Postgres

Kill any application that might be using the postgres port on your host machine.

## Step 3) Create self-signed certificates

```bash
mkdir -p ./api/tls
go run $(go env GOROOT)/src/crypto/tls/generate_cert.go --rsa-bits=2048 --host=localhost
mv *.pem ./api/tls
```

![](/media/cert.png)

## Step 4) Setup up the Postgres container

The database will run in the background with the following command:

```bash
docker-compose up -d db
```

![](/media/db.png)

#### Create your first migration

Make a migration to create a products table.

```bash
docker-compose run migration create_products_table
```

Databases have a tendency to grow. We use migrations to make changes to the postgres database. Migrations are used to _upgrade_ or _downgrade_ the database structure. Add SQL to both `up` & `down` migrations. The down migration simply reverts the up migration if we need to.

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

![](/media/create-products.png)

#### Create a second migration

Let's include tagged information for each product. Make another migration to add a tags Column to the products table.

```bash
docker-compose run migration add_tags_to_products
```

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

![](/media/add-tags.png)

Cool, we have 2 migrations but we haven't used them yet. Migrate the database up to the latest migration.

```bash
docker-compose run up # you can migrate down with "docker-compose run down"
```

Now if we checked the selected migration version, it should render `2`, the number of total migrations.

```bash
docker-compose run version
```

![](/media/up-version.png)

#### Seeding the database

The database is still empty. Create a seed file for the products table.

```bash
touch ./api/internal/schema/seeds/products.sql
```

This adds an empty `products.sql` seed file to the project. Located under: `./api/internal/schema/seeds/`.

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
docker-compose exec db psql postgres postgres -f /seed/products.sql
```

![](/media/insert.png)

Great! Now the database is ready. The output should be `INSERT 0 3`. The 3 represents the 3 rows inserted.

<!-- You can ignore the 0 representing [OIDS](https://www.postgresql.org/message-id/4AD5F063.8050708@iol.ie). -->

Now, let's enter the database and examine its state.

```makefile
docker-compose run debug-db
```

![Minion](/media/compose-db-debug.png)

## Step 5) Run the frontend and backend

If you run the following commands in separate windows you can preserve the initial API output (create-react-app clears the terminal otherwise)

```bash
docker-compose up api
docker-compose up client
```

![run containers](/media/run.png "run containers")

Or run in one command.

```bash
docker-compose up api client
```

Navigate to the API in the browser at: <https://localhost:4000/v1/products>.

_**Note:**_
_To replicate the production environment as much as possible locally, we use self-signed certificates. In your browser, you may see a warning and need to click a link to proceed to the requested page. This is common when using self-signed certificates._

Then navigate to the client app at: <https://localhost:3000> in a separate tab.

![](/media/demo.png)

## Step 6) Run unit and integration tests

Integration tests run in addition to unit tests. During integration tests, a temporary Docker container is programmatically created for Postgres, then automatically destroyed after tests run. Under the hood the integration tests make use of the [testcontainers-go](https://github.com/testcontainers/testcontainers-go).

```bash
cd api
go test -v ./...
```

![](/media/test.png)

### Optional Step) Idiomatic Go development

Containerizing the Go API is optional, so you can work with the API in an idiomatic fashion. This also means you can opt-out of live reloading. When running the API normally use command line flags or exported environment variables. TLS encryption for the database is enabled by default and should be disabled in development.

```bash
export API_DB_DISABLE_TLS=true
cd api
go run ./cmd/api
# or go run ./cmd/api --db-disable-tls=true
```

## Profiling

<div>
To measure how our programs are performing we use profiling. <i>The Go Programming langauge</i> by Alan A. A. Donovan and Brian W. Kernighan writes, <div style="display:inline;background-color: #D2F774">"Profiling is an automated approach to performance measurement based on sampling a number of profile events during the execution, then extrapolating from them during a post-processing step; the resulting statistical summary is called a profile".</div> Amazingly, Go supports many kinds of profiling. The standard library supports profiling with a package named <a href="https://golang.org/pkg/net/http/pprof/" target="_blank">pprof</a>. Here's a few predefined profiles pprof provides:</div>

- block: stack traces that led to blocking on synchronization primitives
- goroutine: stack traces of all goroutines
- heap: sampling traces of all current goroutines
- mutex: stack traces of holders of contended mutexes
- profile: CPU profile

![](/media/experiement.gif)

Using pprof to measure an API, involves importing `net/http/pprof` the standard HTTP interface to profiling data. Since we don't use the import directly and just wish to use its side effects we place an underscore in front of the import. The import will register handlers under /debug/pprof/ using the DefaultServeMux. If you are not using the DefaultServeMux you need to register the handlers with the mux your are using. It's worth noting, that these handlers should not be accessible to the public because of this we use the DefaultServerMux on a dedicated port in a separate goroutine to leverage pprof.

```go
// api/cmd/api/main.go
go func() {
  log.Printf("main: Debug service listening on %s", cfg.Web.Debug)
  err := http.ListenAndServe(cfg.Web.Debug, nil)
  if err != nil {
    log.Printf("main: Debug service failed listening on %s", cfg.Web.Debug)
  }
}()
```

In production, remember that publicly exposing the registered handlers pprof provides is a major security risk. Therefore, we either choose not to expose the profiling server to [Traefik](https://docs.traefik.io/) or ensure it's placed behind an authenticated endpoint. If we navigate to http://localhost:6060/debug/pprof/ we'll see something like this:

![](/media/pprof.png)

Some additional utilities you may want to install are an HTTP load generator like [hey](https://github.com/rakyll/hey) and [graphviz](http://graphviz.gitlab.io/download/) to visualize a cpu profile in a web page.

```bash
brew install hey graphviz
```

Then in one terminal you can make 10 concurrent connections to make 2000 requests to the API.

```bash
hey -c 10 -n 2000 https://localhost:4000/v1/products
```

While in another terminal, we leverage one of the registered handlers setup by pprof. In the case, we want to capture a cpu profile for a duration of 10 seconds to measure the server activity.

```bash
go tool pprof http://localhost:6060/debug/pprof/profile\?seconds\=10
```

Afterward we can run the command `top -cum` (this sorts entries based on their [cumulative value](https://github.com/google/pprof/blob/master/doc/README.md#options)) to analyze the profile captured. The fourth and fifth columns indicate the cumulative amount of time and percentage a function appeared in the samples (while running or waiting for a function to return).

![](/media/profiler.png)

We can also view a visualization by typing `web` into the pprof command prompt which opens a browser window if we have graphviz installed.

![](/media/web.png)

![simple right?](/media/notreally.gif)

Nope! I'm still wrapping my head around profiling in Go but I find pprof and [continuous profiling](https://github.com/profefe/profefe) very interesting. To learn more checkout [debugging performance issues in Go programs](https://github.com/golang/go/wiki/Performance).

## Conclusion

This demonstration included seeding and migrations to handle a growing postgres database. We went from no database, to an empty one, to a seeded one, using a Docker-based workflow. Running the API in a container still uses live reload (like in Part 1). But now there's no makefile abstraction hiding the docker-compose commands. We also discovered we can opt-out of live reload and containerizing the API all together in development taking an idiomatic Go approach with `go run ./cmd/api`, optionally supplying cli flags or exported environment variables.

While testing, we programmatically created a postgres container. In the background, our test database leveraged the same seeding and migration functionality we saw earlier. This enables the tests to set things up before they run. Since we used testcontainers-go any containers created are cleaned up afterwards.

Lastly, we got a glimpse at what profiling a Go API looks like. Profiling shouldn't be a frequent task in your development workflow. Profile your Go applications when performance matters or when issues arise.

<!-- _In the [next post](ultimate-go-react-development-setup-with-docker-part4) I discuss the API implementation._ -->
