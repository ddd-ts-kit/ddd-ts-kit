node_modules
dist
coverage
.git
.worktrees
# The working files of the kit: a lock an interrupted run left would make the build of the image wait for it.
.ddd-ts-kit
.env
.envrc
# .env.local, .env.production and the like hold secrets too; the example is the one to share.
.env.*
!.env.example
*.tsbuildinfo
