# -= cw.js =-
CloudWrangler is: 
- A set of scripts, "Functions", geared toward:
  - cloud ops
  - cluster ops
## -= Running =-
CloudWrangler Functions are intentionally self contained, so they can be run via the CLI or independently interface with your code.

Via the CLI:

`node cw AWSECSWrangleASG us-west-2 cluster01`

As an ES6+ module:

```
const wrangle = await import('cw/functions/AWSECSWrangleASG.js');
await wrangle.run('us-east-1', 'cluster01');
```

There is an example Lambda cron job, utilizing Serverless framework. To deploy:

```
cd serverlessExample
npm install -g serverless
sls deploy --stage prod
```

## -= The Functions =-

### AWSECSRunOnAllTasks
This function takes a cluster name and via ECS Exec runs a cli command on all of the active tasks in said cluster. It returns the console output from each execution.

### AWSECSWrangleASG
As Auto Scaling Groups grow and shrink, they can get into a non-optimal state, whereby there are too many EC2 instances warranted for the tasks demand. `AWSWrangleASG` will analyze an ECS cluster, a given or default ASG, and gracefully downsize that ASG if possible.
