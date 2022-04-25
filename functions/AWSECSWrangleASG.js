/**
 * AWSECSWrangleASG
 * 
 * Takes a cluster name, (optionally a capacity provider) and:
 * - Discerns it's default capacity provider; this will be used if capacity provider is not specified
 * - If it is an EC2 backed auto scaling group it will:
 *   - Evaluate all of the instances capacity
 *   - If it sees an opportunity to remove an EC2 instance from the cluster
 *   - (Without changing the mix of containers running on the cluster)
 *   - It will gracefully drain and terminate that instance
 * 
 * @var {String} CW_VAR_1 Region
 * @var {String} CW_VAR_2 Cluster name
 * @var {String} [CW_VAR_3] Capacity Provider
 * 
 */
import {
    ECSClient,
    ListContainerInstancesCommand,
    DescribeContainerInstancesCommand,
    UpdateContainerInstancesStateCommand
} from "@aws-sdk/client-ecs";

import { 
    AutoScalingClient, 
    TerminateInstanceInAutoScalingGroupCommand
} from "@aws-sdk/client-auto-scaling";

const drainingInstanceTimeoutSeconds = 60;

const reWrangleTimeoutSeconds = 10;

const params = {
    region: process.env.CW_VAR_1 || "us-west-2",
    cluster: process.env.CW_VAR_2 || "engine-stg",
    capacityprovider: process.env.CW_VAR_3 || ""
};
const ecsclient = new ECSClient(params);
const asgclient = new AutoScalingClient(params);

const run = async () => {

    try {
        // Get the active containerInstanceArns given the cluster name
        const containerInstances = await ecsclient.send(
            new ListContainerInstancesCommand({
                cluster: params.cluster,
                status: "ACTIVE",
            }))
        // Get the detail for those containerInstanceArns
        const describeContainerInstances = await ecsclient.send(
            new DescribeContainerInstancesCommand({
                cluster: params.cluster,
                containerInstances: containerInstances.containerInstanceArns
            }))

        // If capacityprovider is specified, parse the container list for only the containers in that capacity provider
        let containersToEvaluate = []; 
        if (params.capacityprovider) {
            containersToEvaluate = describeContainerInstances.containerInstances.filter(record => record.capacityProviderName == params.capacityprovider);
        }
        else {
            containersToEvaluate = describeContainerInstances.containerInstances;
        }

        console.log(`Running AWSECSWrangleASG on cluster: ${params.cluster} and Capacity Provider: ${containersToEvaluate[1].capacityProviderName}`);

        // Calculate the container instance with the most available resources
        // Calculate total available resources
        // Calculate used resources per container instance 
        let instanceWithMostResources = {
            ID: '',
            ARN: '',
            FreeResources: 0,
            UsedResources: 0
        };
        let totalAvailableResources = 0;
        for (const containerInstance of containersToEvaluate) {

           const freeResourceJSON = containerInstance.remainingResources.find(remainingResources => remainingResources.name == "MEMORY");
           const freeResource = parseInt(freeResourceJSON.integerValue);
           const usedResourceJSON = containerInstance.registeredResources.find(registeredResources => registeredResources.name == "MEMORY");
           const usedResource = parseInt(usedResourceJSON.integerValue) - freeResource;
           totalAvailableResources = totalAvailableResources + freeResource;
           console.log(`Container instance: ${containerInstance.ec2InstanceId} has ${usedResource} resource(s) used and ${freeResource} resource(s) available`);

           // If this instance has more resources available then the last highest, make this instance the highest
           if (freeResource > instanceWithMostResources.FreeResources) {
                instanceWithMostResources.FreeResources = freeResource;
                instanceWithMostResources.UsedResources = usedResource;
                instanceWithMostResources.ID = containerInstance.ec2InstanceId;
                instanceWithMostResources.ARN = containerInstance.containerInstanceArn;
           }
        }

        console.log(`There are ${totalAvailableResources} resource(s) available across the ASG`);
        console.log(`The least used instance is ${instanceWithMostResources.ID}, it is using ${instanceWithMostResources.UsedResources} resource(s)`);

        // Calculate whether to wrangle or not
        const freeResourcesAfterWrangle = (totalAvailableResources - instanceWithMostResources.FreeResources) - (instanceWithMostResources.UsedResources);
        if ( freeResourcesAfterWrangle > 0) {
            console.log(`We will wrangle, as we have ${freeResourcesAfterWrangle} resource(s) available after this wrangle. This begins by draining the instance ${instanceWithMostResources.ID}`);
            // We will wrangle, drain the instance in question
            const drainingInstance = await ecsclient.send(
                new UpdateContainerInstancesStateCommand({
                    cluster: params.cluster,
                    containerInstances: [].concat(instanceWithMostResources.ARN),
                    status: "DRAINING"
                }))

            // Wait until the instance has 0 running tasks     
            let drainingInstanceTimeoutCounter = 0;
            let drainingInstanceRunningTasks = 1;
            do {
                // The division by 5 here is a throttling timeout pattern; to ensure that the ecsclient is not flooded with requests
                await new Promise(x => setTimeout(x, (drainingInstanceTimeoutSeconds / 5) * 1000));
                const drainingInstanceUpdate = await ecsclient.send(
                    new DescribeContainerInstancesCommand({
                        cluster: params.cluster,
                        containerInstances: [].concat(instanceWithMostResources.ARN)
                    }))

                drainingInstanceRunningTasks = parseInt(drainingInstanceUpdate.containerInstances.runningTasksCount);

                drainingInstanceTimeoutCounter++;

                // Another part of throttling timeout pattern, 5 + 1 will trip the timeout and throw an error
                if (drainingInstanceTimeoutCounter == 6) {
                    throw `Tried to wrangle but instance did not drain within timeout of ${drainingInstanceTimeoutSeconds} seconds`
                }
            } while (drainingInstanceRunningTasks >> 0);

            // Terminate the instance now that it has fully drained
            const terminatingInstance = await asgclient.send(
                new TerminateInstanceInAutoScalingGroupCommand({
                    InstanceId: instanceWithMostResources.ID,
                    ShouldDecrementDesiredCapacity: true
                }))
                
            // Log the Auto Scaling Group activity that was triggered based off of the instance termination
            console.log(`Terminated instance ${instanceWithMostResources.ID}, ASG replies with: ${terminatingInstance.Activity.Cause}`);
            
            // Sleep and run this script again, as we could have more instances to wrangle    
            await new Promise(x => setTimeout(x, (reWrangleTimeoutSeconds * 1000)));
            run();

        } else {
            // We will not wrangle
            console.log(`We will not wrangle. This cluster's nodes are optimized`)
        }
    
    } catch (err) {
        console.log("Error", err);
    }

}

run();
