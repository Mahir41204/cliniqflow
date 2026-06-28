terraform{
    required_version = ">= 1.7"

    required_providers{
        aws ={
            source = "hashicorp/aws"
            version = "~> 5.0"
        }
    }

    backend "s3" {
        bucket          = "mahir-devops-project1"
        key             = "prod/terraform.tfstate"
        region          = "ap-south-1"
        dynamodb_table  = "terraform-locks"
        encrypt         = true
    }
}

provider "aws" {
    region = "ap-south-1"
}