# Hardened image for executing untrusted analysis programs (spec §17/§18).
# No project code and no secrets are baked in. The program is mounted read-only
# at /src at run time, executed as a non-root user, with --network none and
# resource limits supplied by the caller.
FROM node:22-alpine

# node:22-alpine already provides uid/gid 1000 (the "node" user).
WORKDIR /work
USER 1000:1000

ENTRYPOINT []
CMD ["node", "--version"]
