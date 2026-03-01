FROM postgres:16-alpine

# clang19 + llvm19 required for PostgreSQL LLVM JIT bitcode compilation
RUN apk add --no-cache \
    build-base \
    postgresql-dev \
    git \
    gcc \
    make \
    clang19 \
    llvm19

RUN git clone https://github.com/pgbigm/pg_bigm.git /tmp/pg_bigm \
    && cd /tmp/pg_bigm \
    && make USE_PGXS=1 \
    && make USE_PGXS=1 install \
    && rm -rf /tmp/pg_bigm

RUN apk del build-base git gcc make clang19 llvm19
