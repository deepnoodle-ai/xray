.PHONY: publish-dry publish-first publish-tag

# Publishing
#
# First-time publishing flow:
#   1. make publish-first    # Manual publish with npm token (packages don't exist yet)
#   2. Configure trusted publishing on npmjs.com for each package:
#      - Organization: deepnoodle-ai
#      - Repository: xray
#      - Workflow filename: publish.yml
#   3. Future releases: make publish-tag VERSION=0.2.0
#
# Subsequent releases (after trusted publishing is configured):
#   1. Update version in all package.json files
#   2. make publish-tag VERSION=x.y.z
#   3. GitHub Actions will publish automatically via OIDC

publish-dry: ## Dry run publish to see what would be published
	npm publish --workspaces --access public --dry-run

publish-first: ## First-time publish (requires NPM_TOKEN env var or npm login)
	npm publish --workspaces --access public

publish-tag: ## Create and push a release tag (usage: make publish-tag VERSION=0.1.0)
ifndef VERSION
	$(error VERSION is required. Usage: make publish-tag VERSION=0.1.0)
endif
	git tag v$(VERSION)
	git push origin v$(VERSION)
	@echo "Tag v$(VERSION) pushed. GitHub Actions will publish via OIDC."
